export enum SprintStatusEnum {
  'inProgress' = 'inprogress',
  'completed' = 'completed',
  'closed' = 'closed'
}

export enum SprintErrorEnum {
  taskNotFound = 'Task not Found',
  taskNoAssignee = 'Please assign a Assignee to Add Task in the Sprint',
  taskNoEstimate = 'Please add Task Estimation',
  memberCapacityExceed = 'Member Working Capacity Limit is Exceeded'
}
