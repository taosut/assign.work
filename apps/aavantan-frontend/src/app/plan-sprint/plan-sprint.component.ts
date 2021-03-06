import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import {
  AddTaskToSprintModel,
  AppFilterStorageKeysEnum,
  BoardColumns,
  DraftSprint,
  GetUnpublishedRequestModel,
  Project,
  ProjectMembers,
  RemoveTaskFromSprintModel,
  Sprint,
  SprintBaseRequest,
  SprintDurationsModel,
  SprintErrorEnum,
  SprintErrorResponse, SprintFilterTasksModel, SprintPanel,
  SprintTaskFilterModel,
  StatusDDLModel,
  Task,
  TaskFilterCondition,
  TaskFilterModel,
  TaskStatusModel,
  TaskTypeModel
} from '@aavantan-app/models';
import { untilDestroyed } from 'ngx-take-until-destroy';
import { GeneralService } from '../shared/services/general.service';
import { TaskService } from '../shared/services/task/task.service';
import { TaskQuery } from '../queries/task/task.query';
import { UserQuery } from '../queries/user/user.query';
import { cloneDeep, uniqBy } from 'lodash';
import { NzModalService, NzNotificationService } from 'ng-zorro-antd';
import { SprintService } from '../shared/services/sprint/sprint.service';
import { Router } from '@angular/router';
import { TaskTypeQuery } from '../queries/task-type/task-type.query';
import { combineLatest, Subject } from 'rxjs';
import { auditTime, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TaskStatusQuery } from '../queries/task-status/task-status.query';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'aavantan-app-plan-sprint',
  templateUrl: './plan-sprint.component.html',
  styleUrls: ['./plan-sprint.component.scss']
})
export class PlanSprintComponent implements OnInit, OnDestroy {
  public backLogTasksList: Task[] = [];
  public backLogTasksListBackup: Task[] = [];
  public view: String = 'listView';
  public totalDuration: Number = 0;
  public durationData: any;
  public isDisabledCreateBtn: boolean = true;
  public draftSprint: DraftSprint;
  public draftTaskList: Task[] = [];
  public sprintModalIsVisible: boolean;
  public projectMembers: ProjectMembers[] = [];
  public unPublishedSprintData: Sprint;
  public teamCapacityModalIsVisible: boolean;

  public getBacklogTasksInProcess: boolean;
  public getAllActiveSprintTasksInProcess: boolean;
  public addTaskToSprintInProgress: boolean;
  public removeTaskFromSprintInProgress: boolean;

  public backLogTableLoadingTip: string = 'Loading';
  public sprintTableLoadingTip: string = 'Loading';

  public gettingUnpublishedInProcess: boolean;
  public createdSprintId: string = null;
  public publishSprintInProcess: boolean;
  public activeSprintData: Sprint;
  public haveUnpublishedTasks: boolean;
  public taskTypeDataSource: TaskTypeModel[] = [];

  public searchValue: string;
  public searchValueSubject$: Subject<string> = new Subject<string>();

  public sprintId: string;
  public sprintDurations: SprintDurationsModel;

  public selectedTimeLogTask: Task;

  public backLogTaskRequest: TaskFilterModel;
  public sprintTasksRequest: SprintTaskFilterModel;

  public totalItemsInSprint: Number;

  @Output() toggleTimeLogShow: EventEmitter<any> = new EventEmitter<any>();

  public timelogModalIsVisible: boolean;
  public isVisibleCloseSprint: boolean;
  public dateFormat = 'MM/dd/yyyy';
  public closeSprintNewSprintForm: FormGroup;

  // status ddl
  public statusColumnDataSource: StatusDDLModel[] = [];
  public selectedColumnDataSource: string[] = [];
  public lastStatus: BoardColumns;

  public currentProject: Project;
  public isFilterApplied: boolean;

  public sprintPanels: SprintPanel[] = [{
    name: 'Getting Sprint...',
    active: false
  }];

  constructor(private _generalService: GeneralService,
              private _taskService: TaskService,
              private _taskQuery: TaskQuery,
              private _taskTypeQuery: TaskTypeQuery,
              private _taskStatusQuery: TaskStatusQuery,
              private _userQuery: UserQuery,
              private _sprintService: SprintService,
              protected notification: NzNotificationService,
              private modal: NzModalService,
              private router: Router,
              private _cdr: ChangeDetectorRef) {
  }

  ngOnInit() {

    // subscribe for all task types
    this._taskTypeQuery.types$.pipe(untilDestroyed(this)).subscribe(res => {
      if (res) {
        this.taskTypeDataSource = res;
      }
    });

    // call all functions which is depends on current project and statuses
    combineLatest([this._userQuery.currentProject$, this._taskStatusQuery.statuses$])
      .pipe(auditTime(700), untilDestroyed(this))
      .subscribe(result => {

        this.currentProject = result[0]; // result[0]  is expecting current Project
        const statues = result[1]; // result[1]  is expecting status

        if (!this.currentProject || statues.length === 0) {
          return;
        }

        this.projectMembers = cloneDeep(this.currentProject.members.filter(ele => ele.isInviteAccepted));

        // init backLogTaskRequest request model
        this.backLogTaskRequest = new TaskFilterModel(this.currentProject.id);

        // if project has active sprint than get all tasks of that sprint
        // if not get un-published sprint tasks
        if (this.currentProject.sprintId) {
          this.getActiveSprintData();
          this.sprintTasksRequest = new SprintTaskFilterModel(this.currentProject.id, this.currentProject.sprintId);

          // get active sprint tasks
          this.activeSprintData = cloneDeep(this.currentProject.sprint);
          this.sprintId = this.activeSprintData.id;
          this.setSprintDurations(this.activeSprintData);
        } else {
          // get unpublished sprint data
          this.getUnpublishedSprint();

          // get unpublished sprint tasks
          this.sprintTasksRequest = new SprintTaskFilterModel(this.currentProject.id, null);
        }

        // get all tasks which is already in sprint
        this.getAllSprintTasks();

        // get sprint filter from local storage
        const availableFilter: any = this._generalService.getAppFilter(this.currentProject.id, AppFilterStorageKeysEnum.backLogFilter);
        if (availableFilter) {

          // default fallback
          availableFilter.queries = availableFilter.queries || [];

          const assigneeIndex = availableFilter.queries.findIndex((query) => query.key === 'assigneeId');
          let assigneeIds: string[] = [];
          if (assigneeIndex > -1) {
            assigneeIds = availableFilter.queries[assigneeIndex].value;
          }

          const statusIndex = availableFilter.queries.findIndex((query) => query.key === 'statusId');
          let statusIds: string[] = [];
          if (statusIndex > -1) {
            statusIds = availableFilter.queries[statusIndex].value;
          }

          this.backLogTaskRequest.queries.push({
            key: 'assigneeId',
            value: assigneeIds,
            condition: TaskFilterCondition.and
          });
          this.backLogTaskRequest.queries.push({
            key: 'statusId',
            value: statusIds,
            condition: TaskFilterCondition.and
          });
          this.backLogTaskRequest.query = availableFilter.query;
          this.searchValue = availableFilter.query || '';
          this.isFilterApplied = !!(assigneeIds && assigneeIds.length || (statusIds ? statusIds.length : false));

        } else {

        } // else close for storage check


        // prepare status filter dropdown, with checked or uncheck
        this.getFilterStatus(statues);

        this.getAllBacklogTask();

        // init after current Project
        this.initSprintForm();

      });
    // end combineLatest


    this.searchValueSubject$.pipe(
      debounceTime(700),
      distinctUntilChanged(),
      untilDestroyed(this)
    ).subscribe(val => {
      if (this.backLogTaskRequest && this.currentProject.id) {
        this.backLogTaskRequest.query = val;
        this.backLogTaskRequest.page = 1;
        this.backLogTaskRequest.sort = 'name';
        this.backLogTaskRequest.sortBy = 'asc';
        this.getAllBacklogTask();
      }
    });


    if (this.backLogTasksList && this.backLogTasksList.length > 0) {
      this.countTotalDuration();
    }

    // close sprint form
    this.closeSprintNewSprintForm = new FormGroup({
      projectId: new FormControl(null),
      name: new FormControl(null, [Validators.required]),
      goal: new FormControl(null, [Validators.required]),
      duration: new FormControl(null, [Validators.required]),
      startedAt: new FormControl(null, []),
      endAt: new FormControl(null, []),
      createAndPublishNewSprint: new FormControl(true)
    });
  }

  // init after current Project
  public initSprintForm() {
    // Sprint wizard data
    this.unPublishedSprintData = {
      name: null,
      projectId: this.currentProject.id,
      createdById: this._generalService.user.id,
      goal: null,
      startedAt: null,
      endAt: null,
      sprintStatus: null
    };

  }

  // emitted selected Members Id array from 'user-filter' component
  public selectedMembersForFilter(selectedMembersId: string[]) {
    // if exist assigneeId key in queries then update otherwise add
    const queryIndex = this.backLogTaskRequest.queries.findIndex((query) => query.key === 'assigneeId');

    if (queryIndex === -1) {
      this.backLogTaskRequest.queries.push({
        key: 'assigneeId', value: selectedMembersId, condition: TaskFilterCondition.and
      });
    } else {
      this.backLogTaskRequest.queries[queryIndex].value = selectedMembersId;
    }

    this.getAllBacklogTask();
  }

  public getFilterStatus(statusList: TaskStatusModel[]) {
    // ready status filter dropdown data
    let availableStatusInStorage: string[] = [];

    const columns = cloneDeep(this.currentProject.activeBoard.columns);
    if (columns) {
      this.lastStatus = columns.reverse().find(column => !column.isHidden); // last column object find like 'Done/Complete' using 'isHidden'

      if (statusList && statusList.length > 0) {
        statusList.forEach((ele) => {
          let checked = true;
          if (this.lastStatus.headerStatus.id !== ele.id) {
            this.selectedColumnDataSource.push(ele.id);
          } else {
            checked = false;
          }
          this.statusColumnDataSource.push({
            label: ele.name,
            value: ele.id,
            checked: checked
          });
        });
      }

      // if exist statusId key in queries then update otherwise add
      const queryIndex = this.backLogTaskRequest.queries.findIndex((query) => query.key === 'statusId');
      if (queryIndex === -1) {
        this.backLogTaskRequest.queries.push({
          key: 'statusId', value: this.selectedColumnDataSource, condition: TaskFilterCondition.and
        });
      } else {
        // if filter applied
        if (this.isFilterApplied) {
          availableStatusInStorage = this.backLogTaskRequest.queries[queryIndex].value;

          this.statusColumnDataSource.forEach((ele) => {
            ele.checked = availableStatusInStorage.includes(ele.value);
          });
          this.selectedColumnDataSource = availableStatusInStorage;

          this.backLogTaskRequest.queries[queryIndex].value = availableStatusInStorage;
        } else {
          this.backLogTaskRequest.queries[queryIndex].value = this.selectedColumnDataSource;
        }
      }

    }
  }

  public async getAllBacklogTask() {
    this.backLogTableLoadingTip = 'Getting Backlog Tasks...';
    this.getBacklogTasksInProcess = true;
    try {

      this._generalService.setAppFilter(this.currentProject.id, { backLogFilter: this.backLogTaskRequest });

      const result = await this._taskService.getAllBacklogTasks(this.backLogTaskRequest).toPromise();

      if (result.data) {
        this.backLogTaskRequest.page = result.data.page;
        this.backLogTaskRequest.count = result.data.count;
        this.backLogTaskRequest.totalPages = result.data.totalPages;
        this.backLogTaskRequest.totalItems = result.data.totalItems;

        this.backLogTasksList = cloneDeep(result.data.items);
        this.backLogTasksListBackup = cloneDeep(result.data.items);
      }

      this.getBacklogTasksInProcess = false;
    } catch (e) {
      this.getBacklogTasksInProcess = false;
    }
  }

  public async getAllSprintTasks() {
    this.sprintTableLoadingTip = 'Getting Sprint Tasks..';
    try {
      this.getAllActiveSprintTasksInProcess = true;

      let data;
      if (this.sprintTasksRequest.sprintId) {
        data = await this._taskService.getAllSprintTasks(this.sprintTasksRequest).toPromise();
      } else {
        data = await this._taskService.getAllUnfinishedSprintTasks(this.sprintTasksRequest).toPromise();
      }

      if (data.data) {
        this.draftTaskList = data.data.items;
        this.sprintTasksRequest.page = data.data.page;
        this.sprintTasksRequest.count = data.data.count;
        this.sprintTasksRequest.totalPages = data.data.totalPages;
        this.sprintTasksRequest.totalItems = data.data.totalItems;

        this.totalItemsInSprint = data.data.totalItems;
      } else {
        this.totalItemsInSprint = 0;
      }

      this.getAllActiveSprintTasksInProcess = false;
    } catch (e) {
      this.getAllActiveSprintTasksInProcess = false;
    }
  }

  public async getUnpublishedSprint(hideLoader?: boolean) {
    if (hideLoader) {
      this.gettingUnpublishedInProcess = true;
    }

    try {
      const json: GetUnpublishedRequestModel = {
        projectId: this.currentProject.id
      };

      this._sprintService.getUnpublishedSprint(json).subscribe(data => {
        this.gettingUnpublishedInProcess = false;

        if ((typeof data.data) === 'string') {
          // no un-published sprint found
        } else {
          this.unPublishedSprintData = data.data;
          this.sprintId = this.unPublishedSprintData.id;
          const taskArray: Task[] = [];
          const ids: string[] = [];

          this.unPublishedSprintData.columns.forEach(column => {
            column.tasks.forEach((ele) => {
              ele.task.isSelected = true;
              taskArray.push(ele.task);
              ids.push(ele.task.id);
            });
          });

          this.draftSprint = {
            tasks: taskArray,
            ids: ids
          };
          this.draftTaskList = taskArray;
          if (this.draftTaskList.length > 0) {
            this.haveUnpublishedTasks = true;
            this.isDisabledCreateBtn = false;
          } else {
            this.haveUnpublishedTasks = false;
          }

          this.initSprintPanels();
          this.setSprintDurations(this.unPublishedSprintData);

        }

      });
    } catch (e) {
      this.gettingUnpublishedInProcess = false;
    }

  }

  public countTotalDuration() {
    this.backLogTasksList.forEach((ele) => {
      const duration = ele.estimatedTime ? ele.estimatedTime : 0;
      // @ts-ignore
      this.totalDuration += Number(duration);
      this.durationData = this._generalService.secondsToReadable(Number(this.totalDuration));
    });
  }

  public getTasksSelectedForSprint(ev: DraftSprint) {
    if (this.haveUnpublishedTasks) {
      let tasks = this.draftSprint.tasks.concat(ev.tasks);
      tasks = tasks.filter(task => task.isSelected);
      tasks = uniqBy(tasks, 'id');
      this.draftSprint.tasks = tasks;
    } else {
      if (!this.draftSprint) {
        this.draftSprint = {
          ids: [],
          tasks: []
        };
      }
      this.draftSprint.tasks = ev.tasks.filter(task => task.isSelected);
    }

    this.draftSprint.ids = this.draftSprint.tasks.map(task => task.id);
    this.isDisabledCreateBtn = !(this.draftSprint && this.draftSprint.tasks.length > 0);

    this.prepareDraftSprint();
    this.calculatedraftTaskListDuration();
  }

  public prepareDraftSprint() {
    this.draftTaskList = [...this.draftSprint.tasks];
  }

  public calculatedraftTaskListDuration() {
    let estimatedTime = 0;
    this.draftTaskList.forEach((ele) => {
      estimatedTime = estimatedTime + Number(ele.estimatedTime);
    });

    this.unPublishedSprintData.totalEstimation = estimatedTime;
    this.unPublishedSprintData.totalEstimationReadable = this._generalService.secondsToReadable(this.unPublishedSprintData.totalEstimation).readable;
    this.unPublishedSprintData.totalRemainingCapacity = (this.unPublishedSprintData.totalCapacity * 3600) - estimatedTime;
    this.unPublishedSprintData.totalRemainingCapacityReadable = this._generalService.secondsToReadable(this.unPublishedSprintData.totalRemainingCapacity).readable;
  }

  public toggleAddSprint(data?: Sprint) {
    if (data) {
      this.unPublishedSprintData = data;
      this.sprintId = data.id;
      this.draftTaskList = this.draftTaskList ? this.draftTaskList : [];
      this.initSprintPanels();
      this.setSprintDurations(this.unPublishedSprintData);
    }
    this.sprintModalIsVisible = !this.sprintModalIsVisible;
  }

  public async publishSprint() {
    try {
      const sprintData: SprintBaseRequest = {
        projectId: this.currentProject.id,
        sprintId: this.unPublishedSprintData.id
      };

      this.publishSprintInProcess = true;
      const data = await this._sprintService.publishSprint(sprintData).toPromise();
      if (data) {
        this.isDisabledCreateBtn = true;
        this.router.navigate(['dashboard', 'running-sprint']);
      }
      this.publishSprintInProcess = false;
    } catch (e) {
      this.createdSprintId = null;
      this.publishSprintInProcess = false;
    }
  }

  public toggleTeamCapacity(data?: SprintDurationsModel) {
    if (data) {
      this.sprintDurations = data;
    }
    this.teamCapacityModalIsVisible = !this.teamCapacityModalIsVisible;
  }

  public addTaskNavigate() {
    let displayName: string = null;
    if (this.taskTypeDataSource[0] && this.taskTypeDataSource[0].displayName) {
      displayName = this.taskTypeDataSource[0].displayName;
    }

    if (!displayName) {
      this.notification.error('Info', 'Please create Task Types, Status, Priority from settings');
      setTimeout(() => {
        this.router.navigateByUrl('dashboard/settings');
      }, 1000);
      return;
    }
    this.router.navigateByUrl('dashboard/task/' + displayName);
  }

  public async addTaskToSprint(task: Task, isAdd: boolean, adjustHoursAllowed?: boolean) {
    try {
      if (!isAdd) {
        return;
      }

      const json: AddTaskToSprintModel = {
        projectId: this.currentProject.id,
        sprintId: this.sprintId,
        taskId: task.id,
        adjustHoursAllowed: adjustHoursAllowed
      };

      this.backLogTableLoadingTip = 'Adding Task to Sprint...';
      this.sprintTableLoadingTip = 'Adding Task to Sprint...';
      this.addTaskToSprintInProgress = true;

      const data = await this._sprintService.addTaskToSprint(json).toPromise();

      if (data.data) {
        // check if we found error while adding task

        if (data.data.hasOwnProperty('tasksError') || data.data.hasOwnProperty('membersError')) {
          const errorResponse = data.data as SprintErrorResponse;

          // check if error is related to tasks error or members error
          if (errorResponse.tasksError) {
            // if sprint capacity or member capacity is exceeding show confirm box to allow to exceed sprint capacity
            if (errorResponse.tasksError.reason === SprintErrorEnum.sprintCapacityExceed ||
              errorResponse.tasksError.reason === SprintErrorEnum.memberCapacityExceed) {

              // uncheck item code here
              this.addTaskToSprintInProgress = false;
              await this.addTaskConfirmAfterError(task);
              return;
            } else {
              // set task selected as false
              task.isSelected = false;
              // show error toaster
              this.notification.error('Error', errorResponse.tasksError.reason);
              this.addTaskToSprintInProgress = false;
              return;
            }
          }
        } else {
          this.sprintDurations = data.data as SprintDurationsModel;

          this.draftTaskList = [...this.draftTaskList, task];
          this.sprintTasksRequest.totalItems++;

          this.backLogTasksList = this.backLogTasksList.filter(backLog => backLog.id !== task.id);
          this.backLogTaskRequest.totalItems--;

          this.notification.success('Success', 'Task successfully added to this Sprint');
          this.addTaskToSprintInProgress = false;
        }
      }

    } catch (e) {
      console.log(e);
      this.addTaskToSprintInProgress = false;
    }
  }

  public async removeTaskFromSprint(task: Task) {
    try {
      const json: RemoveTaskFromSprintModel = {
        projectId: this.currentProject.id,
        sprintId: this.sprintId,
        taskId: task.id
      };

      this.backLogTableLoadingTip = 'Removing Task from Sprint...';
      this.sprintTableLoadingTip = 'Removing Task from Sprint...';

      this.removeTaskFromSprintInProgress = true;
      const result = await this._sprintService.removeTaskFromSprint(json).toPromise();

      if (result && result.data) {
        this.draftTaskList = this.draftTaskList.filter(draftTask => draftTask.id !== task.id);
        this.sprintTasksRequest.totalItems--;

        this.backLogTasksList = [...this.backLogTasksList, task];
        this.backLogTaskRequest.totalItems++;

        this.sprintDurations = result.data;
      }

      this.removeTaskFromSprintInProgress = false;
    } catch (e) {
      console.log(e);
      this.removeTaskFromSprintInProgress = false;
    }
  }

  async addTaskConfirmAfterError(task: Task) {
    return this.modal.confirm({
      nzTitle: 'Still Want to add the task?',
      nzContent: 'May be this will effect your current Sprint Or Member Capacity!',
      nzOnOk: () =>
        new Promise((resolve, reject) => {
          this.addTaskToSprint(task, true, true);
          setTimeout(Math.random() > 0.5 ? resolve : reject, 10);
          return true;
        }).catch(() => console.log('Oops errors!')),
      nzOnCancel: () => {
        task.isSelected = false;
      }
    });

  }

  public pageChanged(index: number, requestType: string) {
    if (requestType === 'backlog') {
      this.backLogTaskRequest.page = index;
      this.getAllBacklogTask();

    } else if (requestType === 'activeSprint') {

      this.sprintTasksRequest.page = index;
      this.getAllSprintTasks();
    }
  }

  public sortButtonClicked(type: string, columnName: string, requestType: string) {
    if (requestType === 'backlog') {
      this.backLogTaskRequest.sort = columnName;
      this.backLogTaskRequest.sortBy = type;

      this.getAllBacklogTask();
    } else if (requestType === 'activeSprint') {

      this.sprintTasksRequest.sort = columnName;
      this.sprintTasksRequest.sortBy = type;
      this.getAllSprintTasks();
    }
  }

  /** filter status **/
  public showAll() {
    this.statusColumnDataSource.forEach((ele) => {
      if (this.lastStatus.headerStatus.id !== ele.value) {
        this.selectedColumnDataSource.push(ele.value);
      }
    });

    if (!this._cdr['destroyed']) {
      this._cdr.detectChanges();
    }

    // if exist statusId key in queries then update otherwise add
    const queryIndex = this.backLogTaskRequest.queries.findIndex((query) => query.key === 'statusId');
    if (queryIndex === -1) {
      this.backLogTaskRequest.queries.push({
        key: 'statusId', value: this.selectedColumnDataSource, condition: TaskFilterCondition.and
      });
    } else {
      this.backLogTaskRequest.queries[queryIndex].value = this.selectedColumnDataSource;
    }
    this.getAllBacklogTask();
  }

  public updateSingleChecked(item: any) {


    // if exist statusId key in queries then update otherwise add
    const queryIndex = this.backLogTaskRequest.queries.findIndex((query) => query.key === 'statusId');
    if (queryIndex === -1) {
      this.backLogTaskRequest.queries.push({
        key: 'statusId', value: item, condition: TaskFilterCondition.and
      });
    } else {
      this.backLogTaskRequest.queries[queryIndex].value = item;
    }
    this.getAllBacklogTask();
  }

  /** time log **/
  public timeLog(item: Task) {
    this.timelogModalIsVisible = !this.timelogModalIsVisible;
    this.selectedTimeLogTask = item;
  }

  private setSprintDurations(sprint: Sprint) {
    this.sprintDurations = {
      totalCapacity: sprint.totalCapacity,
      totalCapacityReadable: sprint.totalCapacityReadable,
      totalRemainingCapacity: sprint.totalRemainingCapacity,
      totalRemainingCapacityReadable: sprint.totalRemainingCapacityReadable,
      totalEstimation: sprint.totalEstimation,
      totalEstimationReadable: sprint.totalEstimationReadable
    };
  }

  /** close sprint **/

  toggleCloseSprintShow(): void {
    this.isVisibleCloseSprint = true;
  }

  getActiveSprintData() {
    this._sprintService.filterSprintTasks(new SprintFilterTasksModel(this.currentProject.id, this.currentProject.sprintId)).subscribe(res => {
      this.activeSprintData = res.data;
      this.initSprintPanels();
    });
  }

  // Create Sprint Collapsible Panel
  // calling from getActiveSprintData() or getUnpublishedSprint()
  public initSprintPanels() {
    if (this.activeSprintData && this.activeSprintData.name || this.unPublishedSprintData && this.unPublishedSprintData.name) {
      this.sprintPanels = [];
      const sprintName = (this.activeSprintData && this.activeSprintData.name) ? this.activeSprintData.name : (this.unPublishedSprintData && this.unPublishedSprintData.name);
      this.sprintPanels.push({
        name: sprintName,
        active: false,
        disabled: false
      });
    }
  }

  cancelCloseSprintDialog(): void {
    this.isVisibleCloseSprint = false;
  }

  public ngOnDestroy() {

  }

}
