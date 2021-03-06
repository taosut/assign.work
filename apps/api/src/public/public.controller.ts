import { Controller, Get, Header, Res } from '@nestjs/common';
import { resolvePathHelper } from '../shared/helpers/helpers';

@Controller('public')
export class PublicController {
  constructor() {
  }

  @Get('error-log')
  @Header('Content-Type', 'application/octet-stream')
  getErrorLog(@Res() res) {
    res.sendFile(resolvePathHelper('error.log'));
  }
}
