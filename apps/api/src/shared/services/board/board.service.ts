import { BaseService } from '../base.service';
import {
  BasePaginatedResponse,
  BoardAddNewColumnModel,
  BoardAssignDefaultAssigneeToStatusModel,
  BoardColumnIncludedStatus,
  BoardColumns,
  BoardHideColumnModel,
  BoardHideColumnStatus,
  BoardMergeColumnToColumn,
  BoardMergeStatusToColumn,
  BoardModel,
  BoardModelBaseRequest,
  BoardShowColumnStatus,
  DbCollection,
  GetActiveBoardRequestModel,
  GetAllBoardsRequestModel,
  MongooseQueryModel,
  Project, SaveAndPublishBoardModel,
  TaskStatusModel
} from '@aavantan-app/models';
import { ClientSession, Document, Model } from 'mongoose';
import { NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ModuleRef } from '@nestjs/core';
import { GeneralService } from '../general.service';
import { BoardUtilityService } from './board.utility.service';
import { ProjectService } from '../project/project.service';
import { BadRequest, generateUtcDate } from '../../helpers/helpers';
import { ProjectUtilityService } from '../project/project.utility.service';
import { TaskStatusService } from '../task-status/task-status.service';
import { SprintService } from '../sprint/sprint.service';
import { SprintReportService } from '../sprint-report/sprint-report.service';

const detailsBoardPopulationObject = [{
  path: 'columns.headerStatus', select: 'name _id'
}, { path: 'columns.includedStatuses.status', select: 'name _id' }, {
  path: 'columns.includedStatuses.defaultAssignee',
  select: 'firstName lastName emailId userName profilePic'
}];

export class BoardService extends BaseService<BoardModel & Document> implements OnModuleInit {
  private _projectService: ProjectService;
  private _taskStatusService: TaskStatusService;
  private _sprintService: SprintService;
  private _sprintReportService: SprintReportService;

  private _utilityService: BoardUtilityService;
  private _projectUtilityService: ProjectUtilityService;

  constructor(
    @InjectModel(DbCollection.board) protected readonly _boardModel: Model<BoardModel & Document>,
    private readonly _moduleRef: ModuleRef, private readonly _generalService: GeneralService
  ) {
    super(_boardModel);
  }

  onModuleInit(): void {
    this._projectService = this._moduleRef.get('ProjectService');
    this._sprintService = this._moduleRef.get('SprintService');
    this._sprintReportService = this._moduleRef.get('SprintReportService');
    this._taskStatusService = this._moduleRef.get('TaskStatusService');

    this._utilityService = new BoardUtilityService();
    this._projectUtilityService = new ProjectUtilityService();
  }

  /**
   * get all boards list
   * @param requestModel
   */
  async getAllBoards(requestModel: GetAllBoardsRequestModel) {
    try {
      await this._projectService.getProjectDetails(requestModel.projectId);

      // select columns
      requestModel.select = 'name createdById publishedById projectId isPublished createdAt';

      // populate essential columns
      requestModel.populate = [{
        path: 'createdBy',
        select: 'emailId userName firstName lastName profilePic -_id',
        justOne: true
      }, {
        path: 'publishedBy',
        select: 'emailId userName firstName lastName profilePic -_id',
        justOne: true
      }];

      const result: BasePaginatedResponse<BoardModel> = await this.getAllPaginatedData({
        projectId: requestModel.projectId
      }, requestModel);

      result.items = result.items.map(board => {
        board.id = board._id.toString();
        return board;
      });

      return result;
    } catch (e) {
      throw e;
    }
  }

  /**
   * create default board
   * create board with default status which are created with new project
   * @param project
   * @param session
   */
  async createDefaultBoard(project: Project, session: ClientSession) {
    const board = this._utilityService.prepareDefaultBoardModel(project);
    return await this.create([board], session);
  }

  /**
   * create a new board or updates a existing board
   * @param board
   */
  async createUpdateBoard(board: BoardModel) {
    const result = await this.withRetrySession(async (session: ClientSession) => {
      const projectDetails = await this._projectService.getProjectDetails(board.projectId);

      // get board details when board id is present
      if (board.id) {
        await this.getDetails(board.id, board.projectId);
      }

      // check validations
      this._utilityService.checkValidations(board);

      if (!board.id) {
        // check is duplicate name
        if (await this.isDuplicate(board)) {
          BadRequest('Duplicate board name is not allowed');
        }
      } else {
        // check is duplicate name except this one
        if (await this.isDuplicate(board, board.id)) {
          BadRequest('Duplicate board name is not allowed');
        }
      }

      if (!board.id) {
        // create a new board model
        const boardModel = new BoardModel();
        boardModel.createdById = this._generalService.userId;
        boardModel.name = board.name;
        boardModel.projectId = board.projectId;
        boardModel.columns = [];

        // create board columns from the statuses we have in project
        // get all status and create columns using them
        const statuses = await this._taskStatusService.find({ filter: { projectId: projectDetails.id } });
        this._utilityService.createBoardColumns(statuses, boardModel, this._generalService.userId);

        // create and return new bord
        const newBoard = await this.create([boardModel], session);
        return newBoard[0];
      } else {
        // update existing board
        const updateBoardDoc = {
          $set: {
            name: board.name,
            updatedById: this._generalService.userId
          }
        };

        // update board with id
        return await this.updateById(board.id, updateBoardDoc, session);
      }
    });

    return this.getDetails(board.id ? board.id : result.id, board.projectId, true);
  }

  /**
   * delete board
   * @param requestModel
   */
  async deleteBoard(requestModel: BoardModelBaseRequest) {
    return this.withRetrySession(async (session: ClientSession) => {
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);

      // if board is active than don't allow user to delete the board
      if (projectDetails.activeBoardId.toString() === requestModel.boardId) {
        BadRequest('You can delete current active board');
      }

      // get board details
      await this.getDetails(requestModel.boardId, requestModel.projectId);

      // update board and set deleted to true
      await this.updateById(requestModel.boardId, {
        $set: { isDeleted: true, deletedById: this._generalService.userId, deletedAt: generateUtcDate() }
      }, session);

      return 'Board Deleted Successfully';
    });
  }

  /**
   * create a new column from a status
   * @param requestModel
   */
  async addNewColumn(requestModel: BoardAddNewColumnModel) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);
      const statusDetails = await this._taskStatusService.findOne({
        filter: {
          _id: requestModel.statusId, projectId: requestModel.projectId
        },
        lean: true,
        select: 'name'
      });

      if (!statusDetails) {
        BadRequest('Status not found');
      }

      // get board details
      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId, true);
      let column = new BoardColumns();

      // check if already a column
      const isAlreadyAColumnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.statusId);
      if (isAlreadyAColumnIndex > -1) {

        // set is hidden false if it's already a column in board
        boardDetails.columns[isAlreadyAColumnIndex].isHidden = false;
        column = boardDetails.columns.splice(isAlreadyAColumnIndex, 1)[0];

        // add column at a specific index
        this._utilityService.addColumnAtSpecificIndex(boardDetails, requestModel.columnIndex, column);
      } else {
        // if not a column then move the status which is already merged
        // check if status is already merged in a column
        const columnStatusIndex = this._utilityService.getColumnIndexFromStatus(boardDetails, requestModel.statusId);

        if (columnStatusIndex > -1) {
          // if already merged in column than un-merge / remove it from that column
          this._utilityService.unMergeStatusFromAColumn(boardDetails, columnStatusIndex, requestModel.statusId);
        }

        // create new column object
        column.headerStatusId = requestModel.statusId;
        column.headerStatus = { name: statusDetails.name } as TaskStatusModel;
        column.includedStatuses = [{
          statusId: requestModel.statusId,
          defaultAssigneeId: this._generalService.userId,
          isShown: true
        }];
        column.columnOrderNo = requestModel.columnIndex + 1;
        column.isHidden = false;

        // add column at a specific index
        this._utilityService.addColumnAtSpecificIndex(boardDetails, requestModel.columnIndex, column);
      }

      // reassign column order no
      boardDetails.columns = this._utilityService.reassignColumnOrderNo(boardDetails);

      // update active sprint
      await this.updateActiveSprint(projectDetails, { ...boardDetails }, session);

      // update board by id and set columns
      await this.updateById(requestModel.boardId, {
        $set: { columns: boardDetails.columns }
      }, session);
    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId, true);
  }

  /**
   * save and publish a board
   * update project's active board property
   * if board have sprint than update it's column using new board settings
   * @param requestModel
   */
  async saveAndPublishBoard(requestModel: SaveAndPublishBoardModel) {
    return this.withRetrySession(async (session: ClientSession) => {
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);

      // set saveAndPublish variable on basis of board object in request
      const saveAndPublish = !!requestModel.board;

      // if not save and publish request than prevent user from publish already publish board
      if (!saveAndPublish) {
        if (projectDetails.activeBoardId === requestModel.boardId) {
          BadRequest('This board is already in published for this project');
        }
      }

      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId, true);

      let boardUpdateModal: any = {
        isPublished: true, publishedAt: generateUtcDate(), publishedById: this._generalService.userId
      };

      // check it's save and publish board request
      if (saveAndPublish) {

        // check is duplicate name except this one
        if (await this.isDuplicate(requestModel.board, boardDetails.id)) {
          BadRequest('Duplicate board name is not allowed');
        }

        // update board modal and set name and updated by property
        boardUpdateModal = {
          ...boardUpdateModal,
          name: requestModel.board.name, updatedById: this._generalService.userId
        };
      }

      // set this board as published board by setting isPublished as true
      await this.updateById(requestModel.boardId, {
        $set: boardUpdateModal
      }, session);

      if (projectDetails.activeBoardId.toString() !== requestModel.boardId) {
        // set previous board's isPublished as false
        await this.updateById(projectDetails.activeBoardId, { $set: { isPublished: false } }, session);

        // check if project have active sprint than reassign sprint's columns as per new board suggests
        if (projectDetails.sprintId) {
          await this.updateActiveSprint(projectDetails, { ...boardDetails }, session);
        }

        // update project's active board id
        await this._projectService.updateById(projectDetails.id, { $set: { activeBoardId: requestModel.boardId } }, session);
      }

      return 'Board Published Successfully';
    });
  }

  /**
   * merge status to column
   * @param requestModel
   */
  async mergeStatusToColumn(requestModel: BoardMergeStatusToColumn) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);
      // get board details
      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId, true);

      // get new column index where element is dropped
      const nextColumnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.nextColumnId);
      if (nextColumnIndex === -1) {
        BadRequest('Column not found where to move');
      }

      // check status id present or not
      if (!requestModel.statusId) {
        BadRequest('Status not found to move');
      }

      // if column id and status id both are same then don't do any thing just return it
      if (requestModel.nextColumnId === requestModel.statusId) {
        return;
      }

      // get column where this status already exists
      const previousColumnIndex = this._utilityService.getColumnIndexFromStatus(boardDetails, requestModel.statusId);
      let newStatus: BoardColumnIncludedStatus = new BoardColumnIncludedStatus();
      if (previousColumnIndex > -1) {

        // get status index from the founded column
        const statusIndex = this._utilityService.getStatusIndex(boardDetails.columns, previousColumnIndex, requestModel.statusId);
        if (statusIndex > -1) {

          // get status from previous status
          newStatus = boardDetails.columns[previousColumnIndex].includedStatuses[statusIndex];

          // remove status from previous column
          this._utilityService.unMergeStatusFromAColumn(boardDetails, previousColumnIndex, requestModel.statusId);

          // add status to new column
          boardDetails.columns[nextColumnIndex].includedStatuses.push(newStatus);

          // if previous column don't have any status then remove it from board
          if (!boardDetails.columns[previousColumnIndex].includedStatuses.length) {
            this._utilityService.removeColumnFromBoard(boardDetails, previousColumnIndex);
          }

        } else {
          // status not found
          BadRequest('Status not found from a column');
        }
      } else {
        // status not included in any column create new BoardColumnIncludedStatus an push it to next column
        newStatus.statusId = requestModel.statusId;
        newStatus.defaultAssigneeId = this._generalService.userId;
        newStatus.isShown = true;

        // add status to new column
        boardDetails.columns[nextColumnIndex].includedStatuses.push(newStatus);
      }

      // reassign column order no
      boardDetails.columns = this._utilityService.reassignColumnOrderNo(boardDetails);

      // update active sprint
      await this.updateActiveSprint(projectDetails, { ...boardDetails }, session);

      // update board by id and set columns
      return await this.updateById(requestModel.boardId, {
        $set: { columns: boardDetails.columns }
      }, session);

    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId);
  }

  /**
   * merge column to column
   * @param requestModel
   */
  async mergeColumnToColumn(requestModel: BoardMergeColumnToColumn) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);

      if (requestModel.nextColumnId === requestModel.columnId) {
        BadRequest('Can not Merge Column to same Column');
      }

      // get board details
      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId, true);

      // get new column index where element is dropped
      const nextColumnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.nextColumnId);
      if (nextColumnIndex === -1) {
        BadRequest('Next column not found');
      }

      // ensure that moving element is column or status
      const previousColumnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.columnId);
      if (previousColumnIndex > -1) {
        // moving a column
        const previousColumn = boardDetails.columns[previousColumnIndex];

        // move found column to new column as status
        boardDetails.columns[nextColumnIndex].includedStatuses.push(...previousColumn.includedStatuses);

        // remove previous column from board
        this._utilityService.removeColumnFromBoard(boardDetails, previousColumnIndex);
      } else {
        // column not found
        BadRequest('Column not found...');
      }

      // reassign column order no
      boardDetails.columns = this._utilityService.reassignColumnOrderNo(boardDetails);

      // update active sprint
      await this.updateActiveSprint(projectDetails, { ...boardDetails }, session);

      // update board by id and set columns
      await this.updateById(requestModel.boardId, {
        $set: { columns: boardDetails.columns }
      }, session);

    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId, true);
  }

  /**
   * hide column from board screen
   * @param requestModel
   */
  async hideColumn(requestModel: BoardHideColumnModel) {
    await this.withRetrySession(async (session: ClientSession) => {

      // get project details
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);
      // get board details
      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId, true);

      // get column index from current board
      const columnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.columnId);
      if (columnIndex === -1) {
        BadRequest('Column not found');
      }

      // update column is hidden status to true
      boardDetails.columns[columnIndex].isHidden = true;

      // reassign column index
      boardDetails.columns = this._utilityService.reassignColumnOrderNo(boardDetails);

      // update active sprint
      await this.updateActiveSprint(projectDetails, { ...boardDetails }, session);

      // update board and set column status shown or hidden
      await this.updateById(requestModel.boardId, {
        $set: {
          columns: boardDetails.columns
        }
      }, session);
    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId, true);
  }

  /**
   * show column status
   * @param requestModel
   */
  async showColumnStatus(requestModel: BoardShowColumnStatus) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      await this._projectService.getProjectDetails(requestModel.projectId);
      // get board details
      const boardDetails = await this.findOne({
        filter: { projectId: requestModel.projectId, _id: requestModel.boardId },
        lean: true
      });

      if (!requestModel.statusId) {
        BadRequest('Status not found');
      }

      const columnIndex = this._utilityService.getColumnIndexFromStatus(boardDetails, requestModel.statusId);
      if (columnIndex === -1) {
        BadRequest('Column not found where this status was previously added');
      }

      // get status index from column
      const statusIndex = this._utilityService.getStatusIndex(boardDetails.columns, columnIndex, requestModel.statusId);

      // doc updated object
      const updateDocObject = {
        $set: {
          [`columns.${columnIndex}.includedStatuses.${statusIndex}.isShown`]: true
        }
      };

      // update board and set column status shown or hidden
      await this.updateById(requestModel.boardId, updateDocObject, session);
    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId, true);
  }

  /**
   * hide a status from column on board
   * @param requestModel
   */
  async hideColumnStatus(requestModel: BoardHideColumnStatus) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      await this._projectService.getProjectDetails(requestModel.projectId);
      // get board details
      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId);

      // column id present or not
      if (!requestModel.columnId) {
        BadRequest('Column not found');
      }

      // status id present or not
      if (!requestModel.statusId) {
        BadRequest('Status not found');
      }

      // get column index from columns array
      const columnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.columnId);

      if (columnIndex === -1) {
        BadRequest('Column not found');
      }

      // get status index from column
      const statusIndex = this._utilityService.getStatusIndex(boardDetails.columns, columnIndex, requestModel.statusId);

      // get column from status
      const column = boardDetails.columns[columnIndex];
      // get status from column
      const status = column.includedStatuses[statusIndex];

      // check if one trying to hide main status of column (i.e :- headerStatus of a column )
      if (column.headerStatusId === status.statusId) {
        BadRequest('You can hide default status');
      }

      // doc updated object
      const updateDocObject = {
        $set: {
          [`columns.${columnIndex}.includedStatuses.${statusIndex}.isShown`]: false
        }
      };

      // update board and set column status to hidden
      await this.updateById(requestModel.boardId, updateDocObject, session);
    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId, true);
  }

  /**
   * get all hidden status of a board
   */
  async getAllHiddenStatusesOfABoard(requestModel: BoardModelBaseRequest) {
    try {
      await this._projectService.getProjectDetails(requestModel.projectId);

      const board = await this.findOne({
        filter: { projectId: requestModel.projectId, _id: requestModel.boardId },
        lean: true,
        populate: detailsBoardPopulationObject
      });
      return this._utilityService.filterHiddenStatues(board);
    } catch (e) {
      throw e;
    }
  }

  /**
   * add default assignee to a status
   */
  async addDefaultAssigneeToStatus(requestModel: BoardAssignDefaultAssigneeToStatusModel) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      const projectDetails = await this._projectService.getProjectDetails(requestModel.projectId);
      // get board details
      const boardDetails = await this.getDetails(requestModel.boardId, requestModel.projectId);

      // get column index from columns array
      const columnIndex = this._utilityService.getColumnIndex(boardDetails.columns, requestModel.columnId);

      if (columnIndex === -1) {
        BadRequest('Column not found');
      }

      // get status index from a column
      const statusIndex = this._utilityService.getStatusIndex(boardDetails.columns, columnIndex, requestModel.statusId);

      if (statusIndex === -1) {
        BadRequest('Status not found in column');
      }

      // check if assignee is part or project
      if (!this._projectUtilityService.userPartOfProject(requestModel.assigneeId, projectDetails)) {
        BadRequest('User not found or user is not a part of Project');
      }

      const updateDocObject = {
        [`columns.${columnIndex}.includedStatuses.${statusIndex}.defaultAssigneeId`]: requestModel.assigneeId
      };

      // update board and set default assignee for a status
      await this.updateById(requestModel.boardId, {
        $set: updateDocObject
      }, session);
    });

    return await this.getDetails(requestModel.boardId, requestModel.projectId, true);
  }

  /**
   * get board by id
   * @param model
   */
  async getBoardById(model: GetActiveBoardRequestModel) {
    try {
      await this._projectService.getProjectDetails(model.projectId);
      const statuses = await this._taskStatusService.getAll({ projectId: model.projectId });

      if (!statuses || !statuses.length) {
        BadRequest('No Status found in Project');
      }

      if (!this.isValidObjectId(model.boardId)) {
        BadRequest('Board not found...');
      }

      const board = await this.findOne({
        filter: { projectId: model.projectId, _id: model.boardId },
        lean: true,
        populate: detailsBoardPopulationObject
      });

      if (board) {
        return this._utilityService.convertToVm(board, statuses);
      } else {
        BadRequest('Board not found...');
      }
    } catch (e) {
      throw e;
    }
  }

  /**
   * get board details by id
   * @param boardId
   * @param projectId
   * @param getFullDetails
   */
  async getDetails(boardId: string, projectId: string, getFullDetails: boolean = false) {

    const statuses = await this._taskStatusService.getAll({ projectId });

    if (!statuses || !statuses.length) {
      BadRequest('No Status found in Project');
    }

    if (!this.isValidObjectId(boardId)) {
      throw new NotFoundException('Board not found');
    }

    const queryModel = new MongooseQueryModel();
    queryModel.filter = { _id: boardId, projectId: projectId };
    queryModel.lean = true;

    if (getFullDetails) {
      queryModel.populate = detailsBoardPopulationObject;
    }

    const board = await this.findOne(queryModel);

    if (!board) {
      throw new NotFoundException('Board not found');
    } else {
      return this._utilityService.convertToVm(board, statuses);
    }
  }

  /**
   * update active sprint from project
   * @param projectDetails
   * @param boardDetails
   * @param session
   */
  private async updateActiveSprint(projectDetails: Project, boardDetails: BoardModel, session: ClientSession) {
    // check if there active sprint then re order sprint columns
    if (projectDetails.sprintId) {

      // get sprint details
      let sprintDetails = await this._sprintService.getSprintDetails(projectDetails.sprintId, projectDetails.id);

      // update sprint columns
      sprintDetails = this._sprintService.reassignSprintColumns(boardDetails, sprintDetails);

      // update sprint in db
      await this._sprintService.updateById(projectDetails.sprintId, sprintDetails, session);

      // update sprint report and set final status ids in respect of board changes
      if (sprintDetails.reportId) {
        const lastColumnOfSprint = this._utilityService.getLastColumnFromBoard(boardDetails.columns);
        const finalStatusIds = lastColumnOfSprint.includedStatuses.map(status => status.statusId);

        await this._sprintReportService.updateById(sprintDetails.reportId, {
          $set: { finalStatusIds }
        }, session);
      }
    }
  }

  /**
   * is duplicate board
   * @param board
   * @param exceptThis
   */
  private async isDuplicate(board: BoardModel, exceptThis?: string): Promise<boolean> {
    const queryFilter = {
      projectId: board.projectId, name: { $regex: `^${board.name.trim()}$`, $options: 'i' }
    };

    if (exceptThis) {
      queryFilter['_id'] = { $ne: exceptThis };
    }

    const queryResult = await this.find({
      filter: queryFilter
    });

    return !!(queryResult && queryResult.length);
  }

}
