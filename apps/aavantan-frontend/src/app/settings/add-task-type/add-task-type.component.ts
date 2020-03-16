import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { NzNotificationService } from 'ng-zorro-antd';
import { TaskService } from '../../shared/services/task/task.service';
import { GeneralService } from '../../shared/services/general.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ProjectPriority, TaskPriorityModel, TaskTypeModel } from '@aavantan-app/models';
import { ProjectService } from '../../shared/services/project/project.service';
import { TaskTypeService } from '../../shared/services/task-type/task-type.service';

@Component({
  selector: 'aavantan-task-type',
  templateUrl: './add-task-type.component.html',
  styleUrls: ['./add-task-type.component.scss']
})
export class AddTaskTypeComponent implements OnInit, OnDestroy {
  @Input() public addTaskTypeModalIsVisible: boolean = false;
  @Input() public addEditprojectTaskTypeData: TaskTypeModel;
  @Input() public typesList: TaskTypeModel[];

  @Output() toggleAddTaskTypeShow: EventEmitter<any> = new EventEmitter<any>();

  public taskTypeForm: FormGroup;
  public updateRequestInProcess: boolean;

  constructor(protected notification: NzNotificationService,
              private _taskTypeService: TaskTypeService,
              private _projectService: ProjectService,
              private _generalService: GeneralService,
              private FB: FormBuilder) {
  }

  ngOnInit() {
    this.taskTypeForm = this.FB.group({
      displayName: new FormControl(null, [Validators.required]),
      name: new FormControl(null, [Validators.required]),
      color: new FormControl("#000000" ),
      id: new FormControl(null),
      description: new FormControl(''),
      projectId: new FormControl(this._generalService.currentProject.id)
    });

    if (this.addEditprojectTaskTypeData) {
      this.taskTypeForm.get('name').patchValue(this.addEditprojectTaskTypeData.name);
      this.taskTypeForm.get('color').patchValue(this.addEditprojectTaskTypeData.color);
      this.taskTypeForm.get('displayName').patchValue(this.addEditprojectTaskTypeData.displayName);
      this.taskTypeForm.get('id').patchValue(this.addEditprojectTaskTypeData.id);
      this.taskTypeForm.get('description').patchValue(this.addEditprojectTaskTypeData.description);
      this.taskTypeForm.get('projectId').patchValue(this._generalService.currentProject.id);
    }
  }

  public saveTaskType() {
    if (this.taskTypeForm.invalid) {
      this.notification.error('Error', 'Please check Display name, Color and Task type');
      return;
    }

    if (this.addEditprojectTaskTypeData && this.addEditprojectTaskTypeData.id) {

      console.log('Updated Task Type :', this.taskTypeForm.value);
      this.updateRequestInProcess = false;
      this.toggleAddTaskTypeShow.emit();

    } else {
      
      const dup: TaskTypeModel[] = this.typesList.filter((ele) => {
        if (ele.color === this.taskTypeForm.value.color || ele.name === this.taskTypeForm.value.name || ele.displayName === this.taskTypeForm.value.displayName) {
          return ele;
        }
      });

      if (dup && dup.length > 0) {
        this.notification.error('Error', 'Duplicate Display Name, Color or Task type');
        return;
      }
      this.updateRequestInProcess = true;
      this._taskTypeService.createTaskType(this.taskTypeForm.value).subscribe((res => {
        this.taskTypeForm.reset({ projectId: this._generalService.currentProject.id });
        this.updateRequestInProcess = false;
        this.toggleAddTaskTypeShow.emit();
      }), (error => {
        this.updateRequestInProcess = false;
      }));

    }
  }

  handleCancel(): void {
    this.toggleAddTaskTypeShow.emit();
  }

  ngOnDestroy() {

  }

}