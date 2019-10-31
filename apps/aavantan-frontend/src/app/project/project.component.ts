import { Component, OnInit } from '@angular/core';
import { Task, TaskType, User } from '@aavantan-app/models';
import { NavigationExtras, Router } from '@angular/router';

@Component({
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})

export class ProjectComponent implements OnInit {
  public myTaskList: Task[] = [];
  public allTaskList: Task[] = [];
  public taskObj: Task;
  public memberObj: User;
  public view: String = 'listView';
  public taskTypeDataSource: TaskType[] = [
    {
      id: '1',
      name: 'BUG',
      color: '#F80647'
    },
    {
      id: '2',
      name: 'CR',
      color: '#F0CB2D'
    },
    {
      id: '3',
      name: 'NEW WORK',
      color: '#0E7FE0'
    },
    {
      id: '4',
      name: 'ENHANCEMENTS',
      color: '#0AC93E'
    },
    {
      id: '4',
      name: 'EPIC',
      color: '#1022A8'
    }
  ];

  constructor(private router:Router) {
  }

  ngOnInit(): void {
    for (let i = 0; i < 5; i++) {
      this.memberObj = {
        id: '1212' + (i + 1),
        emailId: 'abc' + (i + 1) + '@gmail.com',
        firstName: 'Pradeep',
        profilePic: '../../assets/images/avatars/thumb-4.jpg'
      };
      this.taskObj = {
        id: '100' + i,
        displayName: 'BUG-100' + i,
        name: 'A responsive table that stacks into cards when space is ' + i + '.',
        progress: (i * 10),
        createdAt: new Date(),
        description: 'task description here, A responsive table that stacks into cardstask description here, A responsive table that stacks into cards',
        status: 'In Progress',
        assignee: this.memberObj,
        totalLoggedTime: 2,
        priority: {
          name: 'Critical',
          color: 'red'
        },
        taskType: {
          name: 'CR',
          color: '#F0CB2D'
        },
        createdBy: '',
        project: ''
      };
      this.myTaskList.push(this.taskObj);
    }
  }


  public createTask(item:TaskType) {
    const navigationExtras: NavigationExtras = {
      queryParams: item
    };
    this.router.navigate(["dashboard", "task"], navigationExtras);
  }
}
