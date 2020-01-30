import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TaskService } from '../shared/services/task.service';
import {
  AddCommentModel,
  CommentPinModel,
  DeleteCommentModel,
  DeleteTaskModel,
  GetAllTaskRequestModel,
  GetCommentsModel,
  GetMyTaskRequestModel,
  GetTaskByIdOrDisplayNameModel,
  Task,
  TaskFilterDto,
  UpdateCommentModel
} from '@aavantan-app/models';

@Controller('task')
@UseGuards(AuthGuard('jwt'))
export class TaskController {
  constructor(private readonly _taskService: TaskService) {

  }

  @Post('get-all')
  async getAll(@Body() model: GetAllTaskRequestModel) {
    return await this._taskService.getAllTasksPaginated(model);
  }

  @Post('my-tasks')
  async getMyTasks(@Body() model: GetMyTaskRequestModel) {
    return await this._taskService.getMyTasksPaginated(model);
  }

  @Post('add')
  async createTask(@Body() task: Task) {
    return await this._taskService.addTask(task);
  }

  @Post('update')
  async updateTask(@Body() model: Task) {
    return await this._taskService.updateTask(model);
  }

  @Post('delete-task')
  async deleteTask(@Body() model: DeleteTaskModel) {
    return await this._taskService.deleteTask(model);
  }

  @Post('get-comments')
  async getComments(@Body() model: GetCommentsModel) {
    return await this._taskService.getComments(model);
  }

  @Post('add-comment')
  async addComment(@Body() model: AddCommentModel) {
    return await this._taskService.addComment(model);
  }

  @Post('update-comment')
  async updateComment(@Body() model: UpdateCommentModel) {
    return await this._taskService.updateComment(model);
  }

  @Post('pin-comment')
  async pinComment(@Body() model: CommentPinModel) {
    return await this._taskService.pinComment(model);
  }

  @Post('delete-comment')
  async deleteComment(@Body() model: DeleteCommentModel) {
    return await this._taskService.deleteComment(model);
  }

  @Post('get-task')
  async getByIdOrDisplayName(@Body() model: GetTaskByIdOrDisplayNameModel) {
    return this._taskService.getTaskByIdOrDisplayName(model);
  }

  @Post('filter')
  async getTask(@Body() filterModel: TaskFilterDto) {
    return await this._taskService.getTasks(filterModel);
  }

  @Post('get-my-tasks')
  async getMyTask(@Body('userId') userId: string, @Body('projectId') projectId: string) {
    return await this._taskService.getMyTasks(userId, projectId);
  }
}
