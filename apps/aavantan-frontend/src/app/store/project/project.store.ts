import { Project } from '@aavantan-app/models';
import { Injectable } from '@angular/core';
import { Store, StoreConfig } from '@datorama/akita';

export interface ProjectState {
  projects: Project[];
  createProjectInProcess: boolean;
  createProjectSuccess: boolean;
  projectSwitchInProcess: boolean;
  projectSwitchedSuccessfully: boolean;
  getAllProjectInProcess:boolean;
}

const initialState: ProjectState = {
  projects: null,
  createProjectInProcess: false,
  createProjectSuccess: false,
  projectSwitchInProcess: false,
  projectSwitchedSuccessfully: false,
  getAllProjectInProcess:false,
};

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'project', resettable: true })
export class ProjectStore extends Store<ProjectState> {

  constructor() {
    super(initialState);
  }
}
