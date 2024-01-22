import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';

@Controller('upload')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file) {
    const fileType = file.originalname.endsWith('.xlsx') ? 'xlsx' : 'csv';
    const result = await this.appService.processFile(file, fileType);
    return { result };
  }
}
