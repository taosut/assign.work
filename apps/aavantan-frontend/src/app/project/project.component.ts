import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  GetAllTaskRequestModel, StatusDDLModel,
  Task,
  TaskFilterCondition,
  TaskFilterModel,
  TaskTypeModel,
  User
} from '@aavantan-app/models';
import { Router } from '@angular/router';
import { TaskService } from '../shared/services/task/task.service';
import { untilDestroyed } from 'ngx-take-until-destroy';
import { TaskQuery } from '../queries/task/task.query';
import { GeneralService } from '../shared/services/general.service';
import { UserQuery } from '../queries/user/user.query';
import { NzNotificationService } from 'ng-zorro-antd';
import { TaskTypeQuery } from '../queries/task-type/task-type.query';

@Component({
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})

export class ProjectComponent implements OnInit, OnDestroy {
  public myTaskList: Task[] = [];
  public allTaskList: Task[] = [];
  public view: String = 'listView';
  public taskTypeDataSource: TaskTypeModel[] = [];
  public getMyTaskInProcess: boolean = true;
  public getTaskInProcess: boolean = true;

  public allTaskFilterRequest: TaskFilterModel;
  public myTaskFilterRequest: TaskFilterModel;

  public isFilterApplied: boolean;

  constructor(protected notification: NzNotificationService,
              private _generalService: GeneralService,
              private _userQuery: UserQuery,
              private router: Router,
              private _taskQuery: TaskQuery,
              private _taskService: TaskService,
              private _taskTypeQuery: TaskTypeQuery) {

    this.allTaskFilterRequest = new TaskFilterModel(this._generalService.currentProject.id);
    this.myTaskFilterRequest = new TaskFilterModel(this._generalService.currentProject.id);

  }

  ngOnInit(): void {
    this._taskTypeQuery.types$.pipe(untilDestroyed(this)).subscribe(res => {
      if (res) {
        this.taskTypeDataSource = res;
      }
    });

    if (this._generalService.currentProject) {
      this.getAllTasks();
      this.getMyTasks();
    }
  }

  getAllTasks() {
    this.getTaskInProcess = true;
    this._taskService.getTaskWithFilter(this.allTaskFilterRequest).subscribe(result => {
      this.getTaskInProcess = false;

      if (result) {

        this.allTaskFilterRequest.page = result.data.page;
        this.allTaskFilterRequest.count = result.data.count;
        this.allTaskFilterRequest.totalItems = result.data.totalItems;
        this.allTaskFilterRequest.totalPages = result.data.totalPages;

        this.allTaskList = result.data.items;
      } else {
        this.allTaskList = [];
      }
    }, error => {
      this.getTaskInProcess = false;
      this.allTaskList = [];
    });
  }

  getMyTasks() {
    this.getMyTaskInProcess = true;

    this._taskService.getTaskWithFilter(this.myTaskFilterRequest, true).subscribe(result => {
      this.getMyTaskInProcess = false;

      if (result) {
        this.myTaskFilterRequest.page = result.data.page;
        this.myTaskFilterRequest.count = result.data.count;
        this.myTaskFilterRequest.totalItems = result.data.totalItems;
        this.myTaskFilterRequest.totalPages = result.data.totalPages;

        this.myTaskList = result.data.items;
      } else {
        this.myTaskList = [];
      }
    }, error => {
      this.getMyTaskInProcess = false;
      this.myTaskList = [];
    });
  }

  public createTask(item?: TaskTypeModel) {
    let displayName: string = null;

    if (this.taskTypeDataSource[0] && this.taskTypeDataSource[0].displayName) {
      displayName = this.taskTypeDataSource[0].displayName;
    }

    if (item && item.displayName) {
      displayName = item.displayName;
    }

    if (!displayName) {
      this.notification.error('Info', 'Please create task types from settings');
      setTimeout(() => {
        this.router.navigateByUrl('dashboard/settings');
      }, 1000);
      return;
    }

    this.router.navigateByUrl('dashboard/task/' + displayName);
  }

  public filterApplied(query: StatusDDLModel[]) {

    let queryIds: string[]= [];
    query.forEach((ele) => {
      if (ele.checked) {
        queryIds.push(ele.value);
      }
    });

    this.myTaskFilterRequest.queries= [];
    this.myTaskFilterRequest.queries.push({
      key: 'statusId', value: queryIds, condition: TaskFilterCondition.and
    });
    this.getMyTasks();
  }

  public searchMyTasks(term: string) {
    this.myTaskFilterRequest.query = term;
    this.myTaskFilterRequest.page = 1;
    this.myTaskFilterRequest.sort = 'name';
    this.myTaskFilterRequest.sortBy = 'asc';

    if(term){
      this.isFilterApplied = true;
    }

    this.getMyTasks();
  }

  public myTaskPageChanged(index: number) {
    this.myTaskFilterRequest.page = index;
    this.getMyTasks();
  }

  public myTaskSortingChanged(request: { type: string, columnName: string }) {
    this.myTaskFilterRequest.sort = request.columnName;
    this.myTaskFilterRequest.sortBy = request.type;

    this.getMyTasks();
  }

  public searchAllTasks(term: string) {
    this.allTaskFilterRequest.query = term;
    this.allTaskFilterRequest.page = 1;
    this.allTaskFilterRequest.sort = 'name';
    this.allTaskFilterRequest.sortBy = 'asc';

    if(term){
      this.isFilterApplied = true;
    }

    this.getAllTasks();
  }

  public allTaskPageChanged(index: number) {
    this.allTaskFilterRequest.page = index;

    this.getAllTasks();
  }

  public allTaskSortingChanged(request: { type: string, columnName: string }) {
    this.allTaskFilterRequest.sort = request.columnName;
    this.allTaskFilterRequest.sortBy = request.type;

    this.getAllTasks();
  }

  public changeView(view: string) {
    this.view = view;
  }

  public ngOnDestroy() {
  }
}
