import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  BuildEmailConfigurationModel,
  DbCollection,
  EmailSubjectEnum,
  EmailTemplatePathEnum,
  GetAllProjectsModel,
  Invitation,
  MongooseQueryModel,
  Project,
  ProjectInvitationType,
  ProjectMembers,
  ProjectTags,
  ProjectTemplateEnum,
  ProjectTemplateUpdateModel,
  ProjectWorkingCapacityUpdateDto,
  RecallProjectInvitationModel,
  RemoveProjectCollaborator,
  ResendProjectInvitationModel,
  SearchProjectCollaborators,
  SearchProjectRequest,
  SearchProjectTags,
  SwitchProjectRequest,
  UpdateProjectRequestModel,
  User,
  UserStatus
} from '@aavantan-app/models';
import { ClientSession, Document, Model } from 'mongoose';
import { BaseService } from '../base.service';
import { UsersService } from '../users.service';
import { GeneralService } from '../general.service';
import {
  DEFAULT_WORKING_CAPACITY,
  DEFAULT_WORKING_CAPACITY_PER_DAY,
  DEFAULT_WORKING_DAYS
} from '../../helpers/defaultValueConstant';
import {
  BadRequest,
  generateUtcDate,
  getDefaultSettingsFromProjectTemplate,
  hourToSeconds,
  validWorkingDaysChecker
} from '../../helpers/helpers';
import { environment } from '../../../environments/environment';
import { InvitationService } from '../invitation.service';
import { ModuleRef } from '@nestjs/core';
import { EmailService } from '../email.service';
import { OrganizationService } from '../organization/organization.service';
import { ProjectUtilityService } from './project.utility.service';
import { TaskStatusService } from '../task-status/task-status.service';
import { BoardService } from '../board/board.service';
import { TaskTypeService } from '../task-type/task-type.service';
import { TaskPriorityService } from '../task-priority/task-priority.service';
import { TaskService } from '../task/task.service';
import { SprintService } from '../sprint/sprint.service';
import { SprintReportService } from '../sprint-report/sprint-report.service';

@Injectable()
export class ProjectService extends BaseService<Project & Document> implements OnModuleInit {
  private _userService: UsersService;
  private _invitationService: InvitationService;
  private _organizationService: OrganizationService;
  private _utilityService: ProjectUtilityService;
  private _taskService: TaskService;
  private _taskStatusService: TaskStatusService;
  private _taskTypesService: TaskTypeService;
  private _taskPriorityService: TaskPriorityService;
  private _boardService: BoardService;
  private _sprintService: SprintService;
  private _sprintReportService: SprintReportService;

  constructor(
    @InjectModel(DbCollection.projects) protected readonly _projectModel: Model<Project & Document>,
    private readonly _generalService: GeneralService, private _moduleRef: ModuleRef, private _emailService: EmailService
  ) {
    super(_projectModel);
  }

  onModuleInit(): void {
    // get services from module
    this._userService = this._moduleRef.get('UsersService');
    this._invitationService = this._moduleRef.get('InvitationService');
    this._organizationService = this._moduleRef.get('OrganizationService');
    this._taskService = this._moduleRef.get('TaskService');
    this._taskStatusService = this._moduleRef.get('TaskStatusService');
    this._taskTypesService = this._moduleRef.get('TaskTypeService');
    this._taskPriorityService = this._moduleRef.get('TaskPriorityService');
    this._boardService = this._moduleRef.get('BoardService');
    this._sprintService = this._moduleRef.get('SprintService');
    this._sprintReportService = this._moduleRef.get(SprintReportService.name);

    this._utilityService = new ProjectUtilityService();
  }

  /**
   * create project
   * @param model: Project
   * first check basic validations then set all default values
   * then add project creator as collaborator
   * if this is first project of a user than set it as current project of user
   * update user object in db
   * return {Project}
   */
  async createProject(model: Project) {
    // check validations
    this._utilityService.checkAddUpdateProjectValidations(model);

    // duplicate project name checker
    if (await this.isDuplicate(model)) {
      BadRequest('Duplicate Project Name not allowed');
    }

    const newProject = await this.withRetrySession(async (session: ClientSession) => {
      // get organization details
      await this._organizationService.getOrganizationDetails(model.organizationId);

      // get user details
      const userDetails = await this._userService.findById(this._generalService.userId);
      if (!userDetails) {
        BadRequest('User not found');
      }

      const projectModel = this._utilityService.prepareProjectModelFromRequest(model);
      projectModel.createdById = this._generalService.userId;

      // add project creator as project collaborator when new project is created
      projectModel.members.push(this._utilityService.prepareProjectMemberModel(userDetails));

      // create project and get project id from them
      const createdProject = await this.create([projectModel], session);

      // set created project as current project of user
      userDetails.currentProject = createdProject[0].id;
      // push project to user projects array
      userDetails.projects.push(createdProject[0].id);

      // update user
      await this._userService.updateUser(userDetails.id, userDetails, session);
      return createdProject[0];
    });
    // get project by id and send it
    return await this.getProjectDetails(newProject.id, true);
  }

  /**
   * update project by id
   * @param model
   */
  async updateProject(model: UpdateProjectRequestModel) {
    // validations
    if (!model.id) {
      throw new BadRequestException('Invalid request');
    }

    // check validations
    this._utilityService.checkAddUpdateProjectValidations(model);

    // duplicate project name checker
    if (await this.isDuplicate(model, model.id)) {
      BadRequest('Duplicate Project Name not allowed');
    }

    // update project process
    await this.withRetrySession(async (session: ClientSession) => {
      // get organization details
      await this._organizationService.getOrganizationDetails(model.organizationId);
      const projectDetails = await this.getProjectDetails(model.id);

      const updatedProject = new Project();
      updatedProject.name = model.name;
      updatedProject.updatedById = this._generalService.userId;
      updatedProject.description = model.description;
      updatedProject.settings = projectDetails.settings;

      // check if default task type is changed
      if (projectDetails.settings.defaultTaskTypeId.toString() !== model.defaultTaskTypeId) {
        // get task type details
        await this._taskTypesService.getDetails(model.id, model.defaultTaskTypeId);

        // set task type id
        updatedProject.settings.defaultTaskTypeId = model.defaultTaskTypeId;
      }

      // check if default status is changed
      if (projectDetails.settings.defaultTaskStatusId.toString() !== model.defaultTaskStatusId) {
        // get task type details
        await this._taskStatusService.getDetails(model.id, model.defaultTaskStatusId);

        // set task status  id
        updatedProject.settings.defaultTaskStatusId = model.defaultTaskStatusId;
      }

      // check if default priority is changed
      if (projectDetails.settings.defaultTaskPriorityId.toString() !== model.defaultTaskPriorityId) {
        // get task priority details
        await this._taskPriorityService.getDetails(model.id, model.defaultTaskPriorityId);

        // set task priority id
        updatedProject.settings.defaultTaskPriorityId = model.defaultTaskPriorityId;
      }

      await this.updateById(model.id, updatedProject, session);
    });

    try {
      return this.getProjectDetails(model.id);
    } catch (e) {
      throw e;
    }
  }

  /**
   * add collaborator to project
   * separate registered and unregistered collaborators
   * create users in db from unregistered collaborators
   * send project invitation to registered and unregistered collaborators
   * @param id
   * @param collaborators
   */
  async addCollaborators(id: string, collaborators: ProjectMembers[]) {
    if (!Array.isArray(collaborators)) {
      throw new BadRequestException('invalid request');
    }

    const projectDetails: Project = await this.getProjectDetails(id);

    const session = await this.startSession();

    const collaboratorsAlreadyInDb: ProjectMembers[] = [];
    const collaboratorsNotInDb: ProjectMembers[] = [];
    const collaboratorsAlreadyInDbButInviteNotAccepted: ProjectMembers[] = [];
    let finalCollaborators: ProjectMembers[] = [];

    try {
      collaborators.forEach(collaborator => {
        // collaborator userId exists then collaborator is available in db
        if (collaborator.userId) {
          // check if user is not adding him/her self to project as collaborator
          if (collaborator.userId === this._generalService.userId) {
            throw new BadRequestException('You can\'t add your self as collaborator');
          }

          // find if some collaborators are in project but invite is not accepted yet
          const inProjectIndex = projectDetails.members.findIndex(s => s.userId === collaborator.userId);
          if (inProjectIndex > -1 && !projectDetails.members[inProjectIndex].isInviteAccepted) {
            collaboratorsAlreadyInDbButInviteNotAccepted.push(collaborator);
          } else {
            collaboratorsAlreadyInDb.push(collaborator);
          }
        } else {
          // collaborator not available in db
          collaboratorsNotInDb.push(collaborator);
        }
      });

      finalCollaborators.push(...collaboratorsAlreadyInDb);

      for (let i = 0; i < collaboratorsNotInDb.length; i++) {
        // in some cases collaborator is working in another organization
        // but we have added him/her as collaborator in our organization
        // so we need to find them by email id, is email id there then user is already a in db
        // then push it to collaboratorsAlreadyInDb array so we don't create user again
        const userFilter = {
          filter: {
            emailId: collaboratorsNotInDb[i].emailId
          }
        };

        const userDetails = await this._userService.findOne(userFilter);
        // if user details found means user is already in db but in different organization
        // then continue the loop, don't create user again and add it to collaboratorsAlreadyInDb array
        if (userDetails) {

          // check if user is not adding him/her self to project as collaborator
          if (userDetails.id === this._generalService.userId) {
            BadRequest('You can\'t add your self as collaborator');
          }

          collaboratorsAlreadyInDb.push({ emailId: userDetails.emailId, userId: userDetails.id });
          finalCollaborators.push({ emailId: userDetails.emailId, userId: userDetails.id });
          collaboratorsNotInDb.splice(i, 1);
          continue;
        }

        // create user model
        const userModel: User = { emailId: collaboratorsNotInDb[i].emailId, username: collaboratorsNotInDb[i].emailId };
        // create new user in db
        const newUser = await this._userService.createUser([userModel], session);

        // update userId property in collaboratorsNotInDb array
        collaboratorsNotInDb[i].userId = newUser[0].id;

        // push new created users to final collaborators array
        finalCollaborators.push({
          userId: newUser[0].id,
          emailId: newUser[0].emailId
        });
      }

      const emailArrays = [];

      // create invitation for collaborators already in db logic goes here
      await this.createInvitation(collaboratorsAlreadyInDb, projectDetails, ProjectInvitationType.normal, session, emailArrays);

      // create invitation logic collaborators not in db goes here
      await this.createInvitation(collaboratorsNotInDb, projectDetails, ProjectInvitationType.signUp, session, emailArrays);

      // create invitation for collaborators already in project but invite not accepted logic goes here
      await this.createInvitation(collaboratorsAlreadyInDbButInviteNotAccepted, projectDetails, ProjectInvitationType.normal, session, emailArrays);

      // start email sending process
      emailArrays.forEach(email => {
        this._emailService.sendMail(email.to, email.subject, email.message);
      });

      // update final collaborators array with default values
      finalCollaborators = finalCollaborators.map(collaborator => {
        collaborator.isEmailSent = true;
        collaborator.isInviteAccepted = false;
        collaborator.workingCapacity = DEFAULT_WORKING_CAPACITY;
        collaborator.workingCapacityPerDay = DEFAULT_WORKING_CAPACITY_PER_DAY;
        collaborator.workingDays = DEFAULT_WORKING_DAYS;
        return collaborator;
      });

      await this.updateById(id, { $push: { 'members': { $each: finalCollaborators } } }, session);
      await this.commitTransaction(session);
      return await this.getProjectDetails(id, true);
    } catch (e) {
      await session.abortTransaction();
      session.endSession();
      throw e;
    }
  }

  /**
   * get project collaborators
   * return project collaborators details
   * @return {Promise<void>}
   */
  async getCollaborators(projectId: string): Promise<ProjectMembers[]> {
    const projectDetails = await this.getProjectDetails(projectId, true);

    return projectDetails.members;
  }

  /**
   * resend project invitation
   * check basic validations
   * find and expire already sent invitations to that user
   * create new invitation and send email again
   */
  async resendProjectInvitation(model: ResendProjectInvitationModel) {
    // check project details
    const projectDetails: Project = await this.getProjectDetails(model.projectId);

    // check if invitation To user exists or not
    const userDetails: User = await this._userService.findOne({
      filter: { emailId: model.invitationToEmailId },
      lean: true
    });

    if (!userDetails) {
      throw new BadRequestException('User not found or user not added as collaborator');
    } else {

      if (userDetails._id.toString() === this._generalService.userId) {
        throw new BadRequestException('You can\'t add your self as collaborator!');
      }

      // if user exist then check if he's added to project as collaborator or not
      const isProjectMember = projectDetails.members.some(s => s.userId === userDetails._id.toString());

      // if not added as collaborator then throw error
      if (!isProjectMember) {
        throw new BadRequestException('User is not added as collaborator');
      }
    }

    const session = await this.startSession();

    try {
      // find all already sent invitations
      const alreadySentInvitationQuery = new MongooseQueryModel();
      alreadySentInvitationQuery.filter = {
        invitedById: this._generalService.userId,
        invitationToId: userDetails._id.toString(),
        projectId: model.projectId,
        isInviteAccepted: false,
        isExpired: false
      };

      // expire all already sent invitations
      await this._invitationService.bulkUpdate(alreadySentInvitationQuery, { $set: { isExpired: true } }, session);

      // create new invitation object
      const newInvitation = this._invitationService.prepareInvitationObject(userDetails._id, this._generalService.userId, projectDetails._id.toString(), userDetails.emailId);

      // create invitation in db
      const invitation = await this._invitationService.createInvitation(newInvitation, session);

      const invitationEmail = {
        to: [model.invitationToEmailId], subject: 'Invitation',
        message: await this.prepareInvitationEmailMessage(ProjectInvitationType.normal, projectDetails, invitation[0].id, model.invitationToEmailId)
      };

      // send email again
      this._emailService.sendMail(invitationEmail.to, invitationEmail.subject, invitationEmail.message);
      this.commitTransaction(session);
      return 'Invitation sent successfully!';
    } catch (e) {
      this.abortTransaction(session);
      throw e;
    }
  }

  /**
   * recall invitation
   * recalls invitation which are not expired or not accepted
   * recalls means mark as expired
   * @param {RecallProjectInvitationModel} dto
   * @return {Promise<any>}
   */
  async recallProjectInvitation(dto: RecallProjectInvitationModel) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get project details
      const projectDetails = await this.getProjectDetails(dto.projectId);

      // get invitation details
      const invitationFindQuery: MongooseQueryModel = {
        filter: {
          invitationToEmailId: dto.invitationToEmailId
        },
        lean: true
      };
      const invitationDetails = await this._invitationService.findOne(invitationFindQuery);
      if (!invitationDetails) {
        BadRequest('Invalid invitation');
      }

      // check if invitation is already accepted
      if (invitationDetails.isInviteAccepted) {
        BadRequest('This user already accepted invitation, so you can\'t recall this invitation');
      }

      // expire invitation
      await this._invitationService.expireInvitationById(invitationDetails._id.toString(), session);

      // pull out that member from project because his/her invitation to project is recalled
      // get project member index by member email id
      const projectMemberIndex = projectDetails.members.findIndex(member => {
        return member.emailId === invitationDetails.invitationToEmailId;
      });

      if (projectMemberIndex > -1) {
        const projectUpdateQuery = {
          $pull: { members: { emailId: invitationDetails.invitationToEmailId, isInviteAccepted: false } }
        };

        // update project members
        await this.updateById(dto.projectId, projectUpdateQuery, session);
      }
    });

    return this.getCollaborators(dto.projectId);
  }

  /**
   * remove collaborator
   * @param dto
   */
  async removeCollaborator(dto: RemoveProjectCollaborator): Promise<ProjectMembers[]> {
    await this.withRetrySession(async (session: ClientSession) => {
      const projectDetails = await this.getProjectDetails(dto.projectId, true);

      // region basic validations
      // check if current user want's to remove him self from project
      if (dto.collaboratorId === this._generalService.userId) {
        BadRequest('You can\'t remove your self from project');
      }

      // check if collaborator whose going to remove is part of project
      const currentCollaboratorDetails = projectDetails.members.find((member) => member.userId === dto.collaboratorId);
      if (!currentCollaboratorDetails) {
        BadRequest('Collaborator is not part of project, so it can\'t be removed from Project');
      }

      // check if next collaborator is part of project
      const nextCollaboratorDetails = projectDetails.members.find((member) => member.userId === dto.nextCollaboratorId);
      if (!nextCollaboratorDetails) {
        BadRequest('New selected Collaborator is not part of project');
      }
      // endregion

      // generic created by query to get get things which is created by collaborator
      const genericCreatedByQuery: MongooseQueryModel = {
        filter: {
          createdById: dto.collaboratorId
        },
        lean: true
      };

      // generic created by update doc
      const genericCreatedByUpdateDoc = {
        createdById: dto.nextCollaboratorId
      };

      // region boards
      // update boards created by collaborator
      await this._boardService.bulkUpdate(genericCreatedByQuery, genericCreatedByUpdateDoc, session);
      // endregion

      // region task status
      // update task status created by collaborator
      await this._taskStatusService.bulkUpdate(genericCreatedByQuery, genericCreatedByUpdateDoc, session);
      // endregion

      // region task priority
      // update task priority created by collaborator
      await this._taskPriorityService.bulkUpdate(genericCreatedByQuery, genericCreatedByUpdateDoc, session);
      // endregion

      // region task types
      // update task types created by collaborator
      await this._taskTypesService.bulkUpdate(genericCreatedByQuery, genericCreatedByUpdateDoc, session);
      // endregion

      // region tasks
      // update assigned tasks of collaborator
      const taskAssignedQuery = {
        projectId: dto.projectId, assigneeId: dto.collaboratorId
      };

      await this._taskService.bulkUpdate(taskAssignedQuery, {
        assigneeId: dto.nextCollaboratorId,
        $pull: { watchers: { $in: [dto.collaboratorId] } },
        $push: { watchers: dto.nextCollaboratorId }
      }, session);

      // update tasks created by collaborator
      const taskCreatedByQuery = {
        projectId: dto.projectId, createdById: dto.collaboratorId
      };

      await this._taskService.bulkUpdate(taskCreatedByQuery, {
        createdById: dto.nextCollaboratorId,
        $pull: { watchers: { $in: [dto.collaboratorId] } },
        $push: { watchers: dto.nextCollaboratorId }
      }, session);

      // update tasks where collaborator is added as watcher
      const collaboratorAsWatcherInTaskQuery = {
        projectId: dto.projectId,
        createdById: { $ne: dto.collaboratorId },
        assigneeId: { $ne: dto.collaboratorId },
        watchers: { $in: [dto.collaboratorId] }
      };

      await this._taskService.bulkUpdate(collaboratorAsWatcherInTaskQuery, {
        $pull: { watchers: { $in: [dto.collaboratorId] } },
        $push: { watchers: dto.nextCollaboratorId }
      }, session);

      // endregion

      // region sprint and sprint report
      if (projectDetails.sprintId) {
        // region sprint

        // get sprint details
        const sprintDetails = await this._sprintService.getSprintDetails(projectDetails.sprintId, projectDetails._id);

        // get current and next collaborator from sprint member capacity
        const currentCollaboratorFromSprint = sprintDetails.membersCapacity.find(member => member.userId.toString() === dto.collaboratorId);
        const nextCollaboratorFromSprint = sprintDetails.membersCapacity.find(member => member.userId.toString() === dto.nextCollaboratorId);

        // check if both current and next collaborator are part of sprint
        if (currentCollaboratorFromSprint && nextCollaboratorFromSprint) {

          // find collaborator index from project members array
          const collaboratorIndexInSprint = sprintDetails.membersCapacity.findIndex(member => {
            return member.userId.toString() === dto.collaboratorId;
          });

          // set collaborator as removed doc
          const setSprintCollaboratorAsRemovedDoc: any = {
            [`membersCapacity.${collaboratorIndexInSprint}.isRemoved`]: true
          };

          // loop over sprint columns and change task assignee, created by or task moved by id
          setSprintCollaboratorAsRemovedDoc['columns'] = sprintDetails.columns.map(column => {
            column.tasks = column.tasks.map(columnTask => {

              // task created by id
              if (columnTask.task.createdById.toString() === dto.collaboratorId) {
                columnTask.task.createdById = dto.nextCollaboratorId;
              }

              // // task update by id
              // if (columnTask.task.updatedById.toString() === dto.collaboratorId) {
              //   columnTask.task.updatedById = dto.nextCollaboratorId;
              // }

              // task assignee id
              if (columnTask.task.assigneeId.toString() === dto.collaboratorId) {
                columnTask.task.assigneeId = dto.nextCollaboratorId;
              }

              // task moved by id
              if (columnTask.movedById.toString() === dto.collaboratorId) {
                columnTask.movedById = dto.collaboratorId;
              }

              return columnTask;
            });
            return column;
          });

          // check if sprint is created by the collaborator than update it's created By id
          if (sprintDetails.createdById.toString() === dto.collaboratorId) {
            setSprintCollaboratorAsRemovedDoc['createdById'] = dto.nextCollaboratorId;
          }

          // check if sprint is published by collaborator than update it's published by id
          setSprintCollaboratorAsRemovedDoc['sprintStatus.updatedById'] = dto.nextCollaboratorId;

          // update report
          await this._sprintService.updateById(sprintDetails._id, setSprintCollaboratorAsRemovedDoc, session);
        }
        // endregion

        // region sprint report
        const sprintReportDetails = await this._sprintReportService.getSprintReportDetails(sprintDetails.reportId);

        // find collaborator index from project members array
        const memberIndexInSprintReport = sprintReportDetails.reportMembers.findIndex(member => {
          return member.userId.toString() === dto.collaboratorId;
        });

        // set collaborator as removed doc
        const setSprintReportMemberAsRemovedDoc: any = {
          [`reportMembers.${memberIndexInSprintReport}.isRemoved`]: true
        };

        setSprintReportMemberAsRemovedDoc['reportTasks'] = sprintReportDetails.reportTasks.map((task) => {

          // task created by id
          if (task.createdById.toString() === dto.collaboratorId) {
            task.createdById = dto.nextCollaboratorId;
          }

          // // task update by id
          // if (task.updatedById.toString() === dto.collaboratorId) {
          //   task.updatedById = dto.nextCollaboratorId;
          // }

          // task assignee id
          if (task.assigneeId.toString() === dto.collaboratorId) {
            task.assigneeId = dto.nextCollaboratorId;
          }

          return task;
        });

        // check if sprint is created by the collaborator than update it's created By id
        if (sprintReportDetails.createdById.toString() === dto.collaboratorId) {
          setSprintReportMemberAsRemovedDoc['createdById'] = dto.nextCollaboratorId;
        }

        // update sprint report
        await this._sprintReportService.updateById(sprintReportDetails._id, setSprintReportMemberAsRemovedDoc, session);
        // endregion
      }
      // endregion

      // region update project and mark collaborator as removed collaborator

      // find collaborator index from project members array
      const collaboratorIndexInProject = projectDetails.members.findIndex(member => {
        return member.userId.toString() === dto.collaboratorId;
      });

      // set collaborator as removed doc
      const setProjectCollaboratorAsRemovedDoc: any = {
        [`members.${collaboratorIndexInProject}.isRemoved`]: true
      };

      // if project is created by the collaborator which we are going to remove than update project created by id
      if (projectDetails.createdById === dto.collaboratorId) {
        setProjectCollaboratorAsRemovedDoc['createdById'] = dto.nextCollaboratorId;
      }

      // update project
      await this.updateById(dto.projectId, setProjectCollaboratorAsRemovedDoc, session);
      // endregion

      // region check if  organization is created by the collaborator which we are going to remove
      if (projectDetails.organization.createdBy.toString() === dto.collaboratorId) {
        // update organization created by id
        await this._organizationService.updateById(projectDetails.organizationId, genericCreatedByUpdateDoc, session);
      }
      // endregion

      // region remove project and organisation from user's projects array
      await this._userService.updateById(dto.collaboratorId, {
        $pull: {
          projects: { $in: [projectDetails._id.toString()] },
          organizations: { $in: [projectDetails.organizationId.toString()] }
        }
      }, session);
      // endregion

      // region send email
      const emailData = {
        user: {
          firstName: currentCollaboratorDetails.userDetails.firstName,
          lastName: currentCollaboratorDetails.userDetails.lastName,
          emailId: currentCollaboratorDetails.userDetails.emailId
        },
        project: {
          name: projectDetails.name
        }
      };
      const emailConfig: BuildEmailConfigurationModel = new BuildEmailConfigurationModel(EmailSubjectEnum.removeCollaborator, EmailTemplatePathEnum.removeCollaborator);
      emailConfig.recipients.push();
      emailConfig.templateDetails.push(emailData);

      this._emailService.buildAndSendEmail(emailConfig);
      // endregion

      return 'Collaborator removed successfully';
    });

    return this.getCollaborators(dto.projectId);
  }

  /**
   * update project template
   * @param model
   */
  async updateProjectTemplate(model: ProjectTemplateUpdateModel) {
    // update project template process
    await this.withRetrySession(async (session: ClientSession) => {

      // get project details
      const project = await this.getProjectDetails(model.projectId);

      // check if valid template selected
      const invalidTemplate = !Object.values(ProjectTemplateEnum).includes(model.template);
      if (invalidTemplate) {
        BadRequest('invalid project template');
      }

      // create default statues
      const defaultStatues = await this._taskStatusService.createDefaultStatuses(project, session);
      if (defaultStatues && defaultStatues.length) {
        defaultStatues.forEach(status => {
          project.settings.statuses.push(status._id);
        });
      }

      // get default settings in respect of chosen template
      const defaultSettings = getDefaultSettingsFromProjectTemplate(model.template);

      // create default task types for project
      const defaultTaskTypes = await this._taskTypesService.createDefaultTaskTypes(defaultSettings.taskTypes, project, session);
      if (defaultTaskTypes && defaultTaskTypes.length) {
        defaultTaskTypes.forEach(taskType => {
          project.settings.taskTypes.push(taskType._id);
        });
      }

      // create default task priorities for project
      const defaultTaskPriorities = await this._taskPriorityService.createDefaultTaskPriorities(defaultSettings.priorities, project, session);
      if (defaultTaskPriorities && defaultTaskPriorities.length) {
        defaultTaskPriorities.forEach(priority => {
          project.settings.priorities.push(priority._id);
        });
      }

      // create default board goes here
      const defaultBoard = await this._boardService.createDefaultBoard(project, session);

      // update project's template and update default taskType, taskStatus and default taskPriority
      await this.updateById(model.projectId, {
        $set: {
          template: model.template,
          activeBoardId: defaultBoard[0].id,
          'settings.defaultTaskTypeId': defaultTaskTypes[0]._id,
          'settings.defaultTaskStatusId': defaultStatues[0]._id,
          'settings.defaultTaskPriorityId': defaultTaskPriorities[0]._id
        },
        $push: {
          'settings.statuses': { $each: project.settings.statuses },
          'settings.taskTypes': { $each: project.settings.taskTypes },
          'settings.priorities': { $each: project.settings.priorities }
        }
      }, session);
    });

    // find project and return updated project
    return await this.getProjectDetails(model.projectId, true);
  }

  /**
   * update collaborator working capacity
   * @param id: project id
   * @param dto: Array of ProjectWorkingCapacityUpdateDto
   */
  async updateCollaboratorWorkingCapacity(id: string, dto: ProjectWorkingCapacityUpdateDto[]) {
    const projectDetails: Project = await this.getProjectDetails(id);

    // check if all users are part of project
    const everyBodyThere = dto.every(ddt => projectDetails.members.some(pd => {
      return pd.userId === ddt.userId && pd.isInviteAccepted;
    }));

    if (!everyBodyThere) {
      throw new BadRequestException('One of Collaborator is not found in Project!');
    }

    // valid working days
    const validWorkingDays = dto.every(ddt => validWorkingDaysChecker(ddt.workingDays));

    if (!validWorkingDays) {
      throw new BadRequestException('One of Collaborator working days are invalid');
    }

    // loop over members and set details that we got in request
    projectDetails.members = projectDetails.members.map(pd => {
      const indexInDto = dto.findIndex(f => f.userId === pd.userId);
      if (indexInDto > -1) {
        pd.workingCapacity = hourToSeconds(dto[indexInDto].workingCapacity) || DEFAULT_WORKING_CAPACITY;
        pd.workingCapacityPerDay = hourToSeconds(dto[indexInDto].workingCapacityPerDay) || DEFAULT_WORKING_CAPACITY_PER_DAY;
        pd.workingDays = dto[indexInDto].workingDays || DEFAULT_WORKING_DAYS;
      }
      return pd;
    });

    // update project
    return await this.updateProjectHelper(id, { $set: { members: projectDetails.members } });
  }

  /**
   * get all projects with pagination
   * @param model
   */
  async getAllProjects(model: GetAllProjectsModel) {
    const filter = {
      organizationId: model.organizationId,
      $and: [{
        $or: [
          { createdBy: this._generalService.userId },
          { members: { $elemMatch: { userId: this._generalService.userId, isInviteAccepted: true } } }
        ]
      }]
    };

    // populate
    model.populate = [{
      path: 'createdBy',
      select: 'emailId userName firstName lastName profilePic'
    }];

    // get result
    const result = await this.getAllPaginatedData(filter, model);
    // assign color to project
    result.items.forEach(project => {
      project.color = this._generalService.generateRandomColor();
    });

    return result;
  }

  async deleteProject(id: string) {
    return this.withRetrySession(async (session) => {
      await this.delete(id, session);
      await session.commitTransaction();
      session.endSession();
      return 'Project Deleted Successfully!';
    });
  }

  /**
   * switch project
   * @param model
   */
  async switchProject(model: SwitchProjectRequest) {
    await this.withRetrySession(async (session: ClientSession) => {
      // get organization details
      await this._organizationService.getOrganizationDetails(model.organizationId);

      // get project details
      await this.getProjectDetails(model.projectId);

      // update project updated at
      await this.updateById(model.projectId, { updatedAt: generateUtcDate() }, session);

      // update user current project
      return await this._userService.updateById(this._generalService.userId, {
        $set: {
          currentProject: model.projectId, currentOrganizationId: model.organizationId
        }
      }, session);
    });

    // return user profile
    return await this._userService.getUserProfile(this._generalService.userId);
  }

  /**
   * search project
   * search by organization
   * search by one is creator of project or an active collaborator in project
   * search by name, description and template
   * @param model
   */
  async searchProject(model: SearchProjectRequest) {
    await this._organizationService.getOrganizationDetails(model.organizationId);

    const query = new MongooseQueryModel();

    query.filter = {
      organizationId: model.organizationId,
      isDeleted: false,
      $and: [{
        $or: [
          { createdBy: this._generalService.userId },
          { members: { $elemMatch: { userId: this._generalService.userId, isInviteAccepted: true } } }
        ]
      }, {
        $or: [
          { name: { $regex: new RegExp(model.query), $options: 'i' } },
          { description: { $regex: new RegExp(model.query), $options: 'i' } },
          { template: { $regex: new RegExp(model.query), $options: 'i' } }
        ]
      }]
    };
    query.select = 'name description template createdAt updatedAt createdById';
    query.populate = [{ path: 'createdBy', select: 'emailId userName firstName lastName profilePic -_id' }];
    query.sort = 'updatedAt';
    query.sortBy = 'desc';
    query.lean = true;

    const projects = await this.find(query);
    return projects.map(project => {
      project.id = project._id.toString();
      project.color = this._generalService.generateRandomColor();
      return project;
    });
  }

  /**
   * search project tags
   * @param model
   * @returns {Promise<ProjectTags[]>}
   */
  async searchTags(model: SearchProjectTags): Promise<ProjectTags[]> {
    if (!this.isValidObjectId(model.projectId)) {
      throw new NotFoundException('Project not found');
    }

    if (typeof model.query !== 'string') {
      throw new BadRequestException('invalid search term');
    }

    const query = new MongooseQueryModel();

    query.filter = {
      _id: model.projectId
    };

    query.select = 'settings.tags';
    query.lean = true;

    // const organizationDetails = await this.getOrganizationDetails(model.organizationId);

    const project: any = await this.findOne(query);

    if (project && project.settings && project.settings.tags) {
      return project.settings.tags
        .filter(tag => !tag.isDeleted && tag.name.toLowerCase().includes(model.query.toLowerCase()))
        .map(tag => {
          return {
            id: tag._id.toString(),
            name: tag.name
          };
        });
    } else {
      return [];
    }
  }

  /**
   * search project collaborators
   * by collaborator first name, last name and email id
   * first find project then filter out project members with request search query
   * @param model: SearchProjectCollaborators
   * @return {Promise<User[]>}
   */
  async searchProjectCollaborators(model: SearchProjectCollaborators) {
    if (!this.isValidObjectId(model.projectId)) {
      throw new NotFoundException('Project not found');
    }

    if (typeof model.query !== 'string') {
      throw new BadRequestException('invalid search term');
    }

    const query = new MongooseQueryModel();

    query.filter = {
      _id: model.projectId
    };

    query.populate = [{
      path: 'members.userDetails',
      select: 'firstName lastName emailId profilePic _id isDeleted status'
    }];

    query.select = 'members';
    query.lean = true;

    const project = await this.findOne(query);
    if (project && project.members && project.members.length) {
      return project.members
        .filter(member => {
          // filter out members who are either removed, or not accepted the invitation or not an active member
          return !member.isRemoved && member.isInviteAccepted && member.userDetails.status === UserStatus.Active;
        })
        .filter(member => {
          // search in email id , first name or last name
          return (
            member.emailId.match(new RegExp(model.query, 'i')) ||
            member.userDetails.firstName.match(new RegExp(model.query, 'i')) ||
            member.userDetails.lastName.match(new RegExp(model.query, 'i'))
          );
        }).map(member => {
          return {
            id: member.userDetails['_id'],
            emailId: member.userDetails.emailId,
            firstName: member.userDetails.firstName,
            lastName: member.userDetails.lastName,
            profilePic: member.userDetails.profilePic
          };
        });
    } else {
      return [];
    }
  }

  /**
   * update project by id
   * @param id
   * @param project
   * @param session
   */
  async updateProjectHelper(id: string, project, session?: ClientSession) {
    if (!session) {
      session = await this.startSession();
    }

    try {
      await this.updateById(id, project, session);
      await this.commitTransaction(session);
      return await this.getProjectDetails(id, true);
    } catch (e) {
      await this.abortTransaction(session);
      throw e;
    }
  }

  /**
   * get project details by id
   * @param id: project id
   * @param getFullDetails
   */
  public async getProjectDetails(id: string, getFullDetails: boolean = false): Promise<Project> {
    if (!this.isValidObjectId(id)) {
      throw new NotFoundException('Project not found');
    }

    // populate basic things
    const populate: any = [
      {
        path: 'createdBy',
        select: 'firstName lastName emailId'
      }, {
        path: 'organization',
        select: 'name createdBy'
      }];

    // check if full details is required
    if (getFullDetails) {
      populate.push({
        path: 'activeBoard',
        select: 'name projectId columns publishedAt publishedById createdById',
        populate: {
          path: 'columns.headerStatus columns.includedStatuses.status columns.includedStatuses.defaultAssignee'
        }
      });
      populate.push({
        path: 'members.userDetails',
        select: 'firstName lastName emailId userName profilePic'
      });
    }

    // project details query
    const projectDetails: Project = await this.findOne({
      filter: { _id: id },
      select: 'name members settings template createdById updatedBy sprintId organizationId activeBoardId',
      populate: populate,
      lean: true
    });

    if (!projectDetails) {
      throw new NotFoundException('Project not found');
    } else {
      if (!this._utilityService.userPartOfProject(this._generalService.userId, projectDetails)) {
        BadRequest('You are not a part of Project');
      }
    }

    // convert to vm
    return this._utilityService.parseProjectToVm(projectDetails);
  }

  /**
   * is duplicate project name
   * @param model
   * @param exceptThis
   */
  private async isDuplicate(model: Project | UpdateProjectRequestModel, exceptThis?: string): Promise<boolean> {
    const queryFilter = {
      organizationId: model.organizationId, name: { $regex: `^${model.name.trim()}$`, $options: 'i' }
    };

    if (exceptThis) {
      queryFilter['_id'] = { $ne: exceptThis };
    }

    const queryResult = await this.find({
      filter: queryFilter
    });

    return !!(queryResult && queryResult.length);
  }

  /**
   * create invitation in db and prepare send email array
   * @param collaborators
   * @param projectDetails
   * @param invitationType
   * @param session
   * @param emailArrays
   */
  private async createInvitation(collaborators: ProjectMembers[], projectDetails: Project, invitationType: ProjectInvitationType, session: ClientSession, emailArrays: any[]) {
    for (let i = 0; i < collaborators.length; i++) {
      const newInvitation = this._invitationService.prepareInvitationObject(collaborators[i].userId, this._generalService.userId, projectDetails._id.toString(), collaborators[i].emailId);

      const invitation = await this._invitationService.createInvitation(newInvitation, session);
      emailArrays.push({
        to: [collaborators[i].emailId],
        subject: 'Invitation',
        message: await this.prepareInvitationEmailMessage(invitationType, projectDetails, invitation[0].id, collaborators[i].emailId)
      });
    }
  }

  /**
   * prepare invitation email message
   * @param type
   * @param projectDetails
   * @param invitationId
   * @param inviteEmailId
   */
  private async prepareInvitationEmailMessage(type: ProjectInvitationType, projectDetails: Project, invitationId: string, inviteEmailId?: string) {

    const linkType = type === ProjectInvitationType.signUp ? 'register' : 'dashboard';
    const link = `${environment.APP_URL}${linkType}?emailId=${inviteEmailId}&invitationId=${invitationId}`;

    const templateData = { project: projectDetails, invitationLink: link, user: projectDetails.createdBy };
    return await this._emailService.getTemplate(EmailTemplatePathEnum.projectInvitation, templateData);
  }
}
