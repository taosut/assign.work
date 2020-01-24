import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import {
  GetAllTaskRequestModel,
  MoveTaskToStage,
  ProjectStatus,
  Sprint,
  SprintStage, SprintStageTask,
  SprintStatusEnum,
  Task, TaskType, User
} from '@aavantan-app/models';
import { GeneralService } from '../../shared/services/general.service';
import { SprintService } from '../../shared/services/sprint/sprint.service';
import { NzModalService, NzNotificationService } from 'ng-zorro-antd';
import { untilDestroyed } from 'ngx-take-until-destroy';
import { UserQuery } from '../../queries/user/user.query';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { cloneDeep } from 'lodash';

@Component({
  selector: 'aavantan-app-board',
  templateUrl: './board.component.html',
  styleUrls: ['./board.component.scss']
})
export class BoardComponent implements OnInit, OnDestroy {

  public boardData: Sprint;
  public boardDataClone: Sprint;

  public timelogModalIsVisible: boolean;
  @Output() toggleTimeLogShow: EventEmitter<any> = new EventEmitter<any>();
  public selectedTaskItem:Task;
  public getStageInProcess: boolean;
  public activeSprintData:Sprint;
  public taskTypeDataSource: TaskType[] = [];
  // close sprint modal
  public selectedSprintStatus: ProjectStatus;
  public statusSprintDataSource: ProjectStatus[] = [];
  public sprintCloseInProcess:boolean;
  public closeSprintModalIsVisible:boolean;
  public isVisibleCloseSprint:boolean;
  public radioOptionValue = 'a';
  public dateFormat = 'MM/dd/yyyy';
  public sprintForm: FormGroup;

  public moveFromStage:SprintStage;


  public sprintDataSource:Sprint[] = [
    {
      id: '1',
      name: 'Sprint 1',
      projectId: '',
      createdById: '',
      goal: '',
      startedAt: new Date(),
      endAt: new Date(),
      sprintStatus: {
        status: SprintStatusEnum.inProgress,
        updatedAt: new Date()
      }
    },
    {
      id: '2',
      name: 'Sprint 2',
      projectId: '',
      createdById: '',
      goal: '',
      startedAt: new Date(),
      endAt: new Date(),
      sprintStatus: {
        status: SprintStatusEnum.inProgress,
        updatedAt: new Date()
      }
    },
    {
      id: '3',
      name: 'Sprint 3',
      projectId: '',
      createdById: '',
      goal: '',
      startedAt: new Date(),
      endAt: new Date(),
      sprintStatus: {
        status: SprintStatusEnum.inProgress,
        updatedAt: new Date()
      }
    }
  ];

  constructor(private _generalService: GeneralService,
              private _sprintService: SprintService,
              protected notification: NzNotificationService,
              private modalService: NzModalService,
              private _userQuery:UserQuery, private router:Router) {

        this._userQuery.currentProject$.pipe(untilDestroyed(this)).subscribe(res => {
          if (res) {
            this.taskTypeDataSource = res.settings.taskTypes;
          }
        });
  }

  ngOnInit() {

    this.activeSprintData = this._generalService.currentProject.sprint;

    if(this._generalService.currentProject.sprintId && this._generalService.currentProject.id){
      this.getBoardData();
    }else{
      this.notification.info('Info', 'Sprint not found');
    }

    this._userQuery.currentProject$.pipe(untilDestroyed(this)).subscribe(res => {
      if (res) {
        this.statusSprintDataSource = res.settings.status;
      }
    })

    this.sprintForm = new FormGroup({
      projectId: new FormControl(this._generalService.currentProject.id, [Validators.required]),
      createdById: new FormControl(this._generalService.user.id, [Validators.required]),
      name: new FormControl(null, [Validators.required]),
      goal: new FormControl(null, [Validators.required]),
      sprintStatus: new FormControl(null, []),
      duration: new FormControl(null, [Validators.required]),
      startedAt: new FormControl(null, []),
      endAt: new FormControl(null, []),
    });

  }


  public filterTask(user:User){

    this.boardData = this.boardDataClone;

    if(this.boardData && this.boardData.stages && this.boardData.stages.length){

      this.boardData.stages.forEach((stage)=>{

        if(stage.tasks && stage.tasks.length){
          let tasks:SprintStageTask[] = [];

          tasks = stage.tasks.filter((task)=>{
            console.log(task.task.assignee.emailId +'---'+ user.emailId)
            if(task.task.assigneeId && task.task.assignee.emailId === user.emailId){
              return task;
            }
          });
          stage.tasks = tasks;
        }

      })

    }

  }



  async getBoardData(){
    try{

      const json: GetAllTaskRequestModel = {
        projectId: this._generalService.currentProject.id,
        sprintId: this._generalService.currentProject.sprintId
      };

      this.getStageInProcess = true;
      const data = await this._sprintService.getBoardData(json).toPromise();
      if(data.data){

        data.data.stages.forEach((stage)=>{
          stage.tasks.forEach((task)=>{
            if(!task.task.priority){
              task.task.priority = {
                name :null,
                color:'#6E829C'
              }
            }
            if(!task.task.taskType){
              task.task.taskType = {
                name :null,
                color:'#6E829C'
              }
            }
          })
        })
        this.boardData = data.data;
        this.boardDataClone = cloneDeep(data.data);
      }
      this.getStageInProcess = false;
    }catch (e) {
      this.getStageInProcess = false;
    }

  }

  public moveTask(task: SprintStageTask, stageId:string){
    try{

      const json: MoveTaskToStage = {
        projectId : this._generalService.currentProject.id,
        sprintId: this.activeSprintData.id,
        stageId: stageId,
        taskId: task.taskId
      }

      // console.log('json :', json);

      this.getStageInProcess = true;
      this._sprintService.moveTaskToStage(json).toPromise();
      this.moveFromStage = null;
      this.getStageInProcess = false;
    }catch (e) {
      this.getStageInProcess = false;
    }
  }

  onDragStart(item: SprintStage) {
    this.moveFromStage = item;
  }

  onDragEnd($event, item: SprintStage) {

    this.moveTask($event.data, item.id);

    //push to target stage
    item.tasks.push($event.data);

    //pop from source stage
    if(this.moveFromStage) {
      this.moveFromStage.tasks = this.moveFromStage.tasks.filter((ele) => {
        if (ele.taskId !== $event.data.taskId) {
          return ele;
        }
      })
    }

  }

  //============ close sprint =============//
  // public toggleCloseSprintShow(item?:Sprint){
  //   this.closeSprintModalIsVisible = !this.closeSprintModalIsVisible;
  //   if(item){
  //     this.activeSprintData=item;
  //   }
  // }

  public selectStatus(item: ProjectStatus) {
    this.selectedSprintStatus = item;
  }

  toggleCloseSprintShow(): void {
    this.isVisibleCloseSprint = true;
  }

  handleOk(): void {
    this.isVisibleCloseSprint = false;
  }

  handleCancel(): void {
    this.isVisibleCloseSprint = false;
  }

  //---------------------------------------//

  public viewTask(task: Task) {
    this.router.navigateByUrl("dashboard/task/"+task.displayName);
  }

  public addTaskNavigate(){
    let displayName: string= null;
    if(this.taskTypeDataSource[0] && this.taskTypeDataSource[0].displayName){
      displayName=this.taskTypeDataSource[0].displayName;
    }

    if(!displayName){
      this.notification.error('Info', 'Please create Stages, Task Types, Status, Priority from settings');
      setTimeout(()=>{
        this.router.navigateByUrl("dashboard/settings");
      },1000);
      return
    }
    this.router.navigateByUrl("dashboard/task/"+displayName);
  }

  public timeLog(item:Task) {
    this.timelogModalIsVisible = !this.timelogModalIsVisible;
    this.selectedTaskItem=item;
  }


  ngOnDestroy() {

  }

}
