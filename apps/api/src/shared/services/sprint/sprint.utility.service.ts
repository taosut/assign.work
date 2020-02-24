import {
  BoardModel,
  EmailSubjectEnum,
  EmailTemplatePathEnum,
  Sprint,
  SprintColumn,
  SprintErrorEnum,
  Task,
  User
} from '@aavantan-app/models';
import { BadRequestException } from '@nestjs/common';
import * as moment from 'moment';
import { BadRequest, secondsToHours, secondsToString } from '../../helpers/helpers';
import { DEFAULT_DATE_FORMAT, DEFAULT_DECIMAL_PLACES } from '../../helpers/defaultValueConstant';
import { EmailService } from '../email.service';
import { orderBy } from 'lodash';
import { BoardUtilityService } from '../board/board.utility.service';

export class SprintUtilityService {
  private _boardUtilityService: BoardUtilityService;
  protected _emailService: EmailService;

  constructor() {
    this._boardUtilityService = new BoardUtilityService();
    this._emailService = new EmailService();
  }

  /**
   * common sprint related validations
   * check name, started At, end At, goal present or not
   * check sprint start date is not before today
   * check sprint end date is not before start date
   * @param sprint
   */
  commonSprintValidator(sprint: Sprint) {
    // check if sprint is available or not
    if (!sprint) {
      BadRequest('Invalid request sprint details missing');
    }

    // sprint name
    if (!sprint.name) {
      BadRequest('Sprint Name is compulsory');
    }

    // sprint goal
    if (!sprint.goal) {
      BadRequest('Sprint goal is required');
    }

    // sprint started at
    if (!sprint.startedAt) {
      BadRequest('Please select Sprint Start Date');
    }

    // sprint end at
    if (!sprint.endAt) {
      BadRequest('Please select Sprint End Date');
    }

    // started date can not be before today
    const isStartDateBeforeToday = moment(sprint.startedAt).isBefore(moment().startOf('d'));
    if (isStartDateBeforeToday) {
      BadRequest('Sprint Started date can not be Before Today');
    }

    // end date can not be before start date
    const isEndDateBeforeTaskStartDate = moment(sprint.endAt).isBefore(sprint.startedAt);
    if (isEndDateBeforeTaskStartDate) {
      BadRequest('Sprint End Date can not be before Sprint Start Date');
    }
  }

  /**
   * check whether task is valid or not to add in sprint or move in a stage
   * @param task
   * @param isMoveTaskProcess
   */
  checkTaskIsAllowedToAddInSprint(task: Task, isMoveTaskProcess: boolean = false) {
    // check if task found
    if (task) {
      // check task assignee
      if (!task.assigneeId) {
        BadRequest(SprintErrorEnum.taskNoAssignee);
      }

      // check task estimation
      if (!task.estimatedTime) {
        BadRequest(SprintErrorEnum.taskNoEstimate);
      }

      // check if task is already in sprint
      if (!isMoveTaskProcess && task.sprintId) {
        BadRequest(SprintErrorEnum.alreadyInSprint);
      }
    } else {
      // if task not found return error
      BadRequest(SprintErrorEnum.taskNotFound);
    }
  }

  /**
   * convert sprint object to it's view model
   * @param sprint
   * @returns {Sprint}
   */
  prepareSprintVm(sprint: Sprint): Sprint {
    if (!sprint) {
      return sprint;
    }

    sprint.id = sprint['_id'];
    // count how many days left for sprint completion
    sprint.sprintDaysLeft = moment(sprint.endAt).diff(moment(), 'd');

    // calculate sprint totals
    this.calculateSprintEstimates(sprint);

    // loop over columns and filter out hidden columns and
    // convert total estimation time to readable format
    if (sprint.columns) {

      sprint.columns = sprint.columns.filter(column => !column.isHidden).map(column => {
        column.tasks = column.tasks.filter(task => !task.removedById);
        column.tasks = column.tasks.map(task => {
          task.task = this.parseTaskObjectVm(task.task);
          task.totalLoggedTimeReadable = secondsToString(task.totalLoggedTime);
          return task;
        });
        return column;
      });

      this.calculateTotalEstimateForColumns(sprint);

      sprint.columns.forEach(column => {
        column.totalEstimationReadable = secondsToString(column.totalEstimation);
      });
    }

    // loop over sprint members and convert working capacity to readable format
    if (sprint.membersCapacity) {
      sprint.membersCapacity.forEach(member => {
        // convert capacity to hours again
        member.workingCapacity = secondsToHours(member.workingCapacity);
        member.workingCapacityPerDay = secondsToHours(member.workingCapacityPerDay);
      });
    }

    return sprint;
  }

  /**
   * parse task object, convert seconds to readable string, fill task type, priority, status etc..
   * @param task : Task
   */
  parseTaskObjectVm(task: Task) {
    task.id = task['_id'];

    task.isSelected = !!task.sprintId;

    // convert all time keys to string from seconds
    task.totalLoggedTimeReadable = secondsToString(task.totalLoggedTime || 0);
    task.estimatedTimeReadable = secondsToString(task.estimatedTime || 0);
    task.remainingTimeReadable = secondsToString(task.remainingTime || 0);
    task.overLoggedTimeReadable = secondsToString(task.overLoggedTime || 0);

    if (task.attachmentsDetails) {
      task.attachmentsDetails.forEach(attachment => {
        attachment.id = attachment['_id'];
      });
    }
    return task;
  }

  /**
   * publish sprint validation
   * check validations before publishing the sprint
   * check start date is not in past
   * end date is not before start date
   * check if sprint has any task or not
   * @param sprintDetails
   */
  publishSprintValidations(sprintDetails: Sprint) {
    // validation
    const sprintStartDate = moment(sprintDetails.startedAt);
    const sprintEndDate = moment(sprintDetails.endAt);

    // sprint start date is before today
    if (sprintStartDate.isBefore(moment(), 'd')) {
      throw new BadRequestException('Sprint start date is before today!');
    }

    // sprint end date can not be before today
    if (sprintEndDate.isBefore(moment(), 'd')) {
      throw new BadRequestException('Sprint end date is passed!');
    }

    // check if sprint has any tasks or not
    const checkIfThereAnyTasks = sprintDetails.columns.some(stage => {
      return !!stage.tasks.length;
    });

    if (!checkIfThereAnyTasks) {
      throw new BadRequestException('No task found, Please add at least one task to publish the sprint');
    }
  }

  async sendPublishedSprintEmails(sprintDetails: Sprint) {
    // prepare sprint email templates
    const sprintEmailArray = [];

    for (let i = 0; i < sprintDetails.membersCapacity.length; i++) {
      const member = sprintDetails.membersCapacity[i];
      sprintEmailArray.push({
        to: member.user.emailId,
        subject: EmailSubjectEnum.sprintPublished,
        message: await this.prepareSprintPublishEmailTemplate(sprintDetails, member.user, member.workingCapacity)
      });
    }

    // send mail to all the sprint members
    sprintEmailArray.forEach(email => {
      this._emailService.sendMail([email.to], email.subject, email.message);
    });
  }

  /**
   * prepare publish sprint template for sending mail when sprint is published
   * @param sprint
   * @param user
   * @param workingCapacity
   */
  private prepareSprintPublishEmailTemplate(sprint: Sprint, user: User, workingCapacity: number): Promise<string> {
    const templateData = {
      user,
      sprint: {
        name: sprint.name,
        startedAt: moment(sprint.startedAt).format(DEFAULT_DATE_FORMAT),
        endAt: moment(sprint.endAt).format(DEFAULT_DATE_FORMAT),
        workingCapacity: secondsToString(workingCapacity)
      }
    };
    return this._emailService.getTemplate(EmailTemplatePathEnum.publishSprint, templateData);
  }

  /**
   * get column index from column id
   * @param sprint
   * @param columnId
   */
  getColumnIndexFromColumn(sprint: Sprint, columnId: string) {
    return sprint.columns.findIndex(column => {
      return column.id.toString() === columnId.toString();
    });
  }

  /**
   * calculate sprint estimates
   * and convert seconds to readable format
   * @param sprint
   */
  calculateSprintEstimates(sprint: Sprint) {

    // convert total capacity in readable format
    sprint.totalCapacityReadable = secondsToString(sprint.totalCapacity);

    // convert estimation time in readable format
    sprint.totalEstimationReadable = secondsToString(sprint.totalEstimation);

    // calculate total remaining capacity
    sprint.totalRemainingCapacity = sprint.totalCapacity - sprint.totalEstimation || 0;
    sprint.totalRemainingCapacityReadable = secondsToString(sprint.totalRemainingCapacity);

    // convert total logged time in readable format
    sprint.totalLoggedTimeReadable = secondsToString(sprint.totalLoggedTime);

    // convert total over logged time in readable format
    sprint.totalOverLoggedTimeReadable = secondsToString(sprint.totalOverLoggedTime || 0);

    // calculate progress
    sprint.progress = Number(((100 * sprint.totalLoggedTime) / sprint.totalEstimation).toFixed(DEFAULT_DECIMAL_PLACES)) || 0;
    if (sprint.progress > 100) {
      sprint.progress = 100;

      // set total remaining time to zero
      sprint.totalRemainingTime = 0;
      sprint.totalRemainingTimeReadable = secondsToString(sprint.totalRemainingTime);
    } else {
      // calculate total remaining time
      sprint.totalRemainingTime = sprint.totalEstimation - sprint.totalLoggedTime || 0;
      sprint.totalRemainingTimeReadable = secondsToString(sprint.totalRemainingTime);
    }

    // calculate over progress
    sprint.overProgress = Number(((100 * sprint.totalOverLoggedTime) / sprint.totalEstimation).toFixed(DEFAULT_DECIMAL_PLACES)) || 0;

    // convert seconds to hours for displaying on ui
    sprint.totalCapacity = secondsToHours(sprint.totalCapacity);
    sprint.totalEstimation = secondsToHours(sprint.totalEstimation);
    sprint.totalRemainingCapacity = secondsToHours(sprint.totalRemainingCapacity);
    sprint.totalLoggedTime = secondsToHours(sprint.totalLoggedTime);
    sprint.totalOverLoggedTime = secondsToHours(sprint.totalOverLoggedTime || 0);
    sprint.totalRemainingTime = secondsToHours(sprint.totalRemainingTime);

    // calculate sprint columns estimates
    if (sprint.columns) {
      this.calculateTotalEstimateForColumns(sprint);
    }
  }

  /**
   * calculate total estimate for all the sprint columns
   */
  calculateTotalEstimateForColumns(sprint: Sprint) {
    return sprint.columns.map(column => {
      column.totalEstimation = column.tasks.reduce((previousValue, currentValue) => {
        return previousValue + (currentValue.task ? currentValue.task.estimatedTime : 0);
      }, 0);
    });
  }

  /**
   * re order sprint columns with board columns
   */
  reOrderSprintColumns(board: BoardModel, sprint: Sprint) {
    const sprintColumns = [];
    board.columns = orderBy(board.columns, 'columnOrderNo', 'asc');

    board.columns.forEach((column, index) => {
      const sprintColumnIndex = this.getColumnIndexFromColumn(sprint, column.headerStatusId);
      sprintColumns.splice(index, 0, sprint.columns[sprintColumnIndex]);
    });

    return sprintColumns;
  }

  /**
   *
   * @param sprint
   * @param taskId
   */
  getColumnIndexFromTask(sprint: Sprint, taskId: string = ''): number {
    return sprint.columns.findIndex(column => {
      return column.tasks.some(task => task.taskId.toString() === taskId.toString());
    });
  }

  /**
   * get task index from current sprint column
   * @param sprint
   * @param columnIndex
   * @param taskId
   */
  getTaskIndexFromColumn(sprint: Sprint, columnIndex: number, taskId: string) {
    return sprint.columns[columnIndex].tasks.findIndex(task => task.taskId.toString() === taskId.toString());
  }

  /**
   * reassign sprint when a board get's updated
   * @param activeBoard
   * @param activeSprint
   */
  reassignSprintColumns(activeBoard: BoardModel, activeSprint: Sprint) {

    // check if there are any changes in board
    activeSprint.columns.forEach(column => {
      const columnIndexInBoard = this._boardUtilityService.getColumnIndex(activeBoard.columns, column.id);

      // column found then update it's is hidden and all other things
      if (columnIndexInBoard > -1) {
        column.isHidden = activeBoard.columns[columnIndexInBoard].isHidden;
      } else {

        /** if column not found then there should be some scenarios we have to check
         * 1. column merged to a another column as a status
         * **/
          // 1. column merged to another column so column itself become a status
        const columnIndexFromStatusesOfBoard = this._boardUtilityService.getColumnIndexFromStatus(activeBoard, column.id);

        if (columnIndexFromStatusesOfBoard > -1) {
          // find the new column id where the current column merged as status
          const newColumnId = activeBoard.columns[columnIndexFromStatusesOfBoard].headerStatusId;

          // now column found as a status so we need to move all the task of this column to the column we found in the sprint
          // so first we need to find if found column is in sprint or not and if yes than move this columns tasks to that column task
          const columnIndexInSprint = this.getColumnIndexFromColumn(activeSprint, newColumnId);

          if (columnIndexInSprint > -1) {
            // now we found column in sprint than move all task from current column to this column
            activeSprint.columns[columnIndexInSprint].tasks.push(...column.tasks);

            // set this column as hidden because it's got merged on another column
            column.isHidden = true;
            column.tasks = [];
            column.totalEstimation = 0;
            column.totalEstimationReadable = '';
          }
        }
      }
    });

    const newColumns = activeBoard.columns.filter(column => {
      return !activeSprint.columns.some(sprintColumn => sprintColumn.id.toString() === column.headerStatusId.toString());
    });

    if (newColumns.length) {

      // create new columns in sprint
      newColumns.forEach(nColumn => {
        const allTasksWithThisStatus = [];

        // loop over all the tasks and get the tasks which status is equal to new column status
        // assign matched tasks to the new column tasks
        activeSprint.columns.forEach(column => {
          column.tasks.forEach((columnTask, index) => {
            if (columnTask.task.statusId.toString() === nColumn.headerStatusId.toString()) {
              allTasksWithThisStatus.push(columnTask);
              column.tasks.splice(index, 1);
            }
          });
        });

        // create new column
        const sprintColumn = new SprintColumn();
        sprintColumn.id = nColumn.headerStatusId;
        sprintColumn.statusId = nColumn.headerStatusId;
        sprintColumn.name = nColumn.headerStatus.name;
        sprintColumn.tasks = allTasksWithThisStatus;
        sprintColumn.totalEstimation = 0;
        sprintColumn.isHidden = false;

        // add new column to sprint columns
        activeSprint.columns.push(sprintColumn);
      });
    }

    // calculate total estimation for all the sprint columns
    this.calculateTotalEstimateForColumns(activeSprint);
    activeSprint.columns = this.reOrderSprintColumns(activeBoard, activeSprint);

    return activeSprint;
  }
}
