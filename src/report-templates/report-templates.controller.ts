import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ReportTemplatesService } from './report-templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('report-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportTemplatesController {
  constructor(private readonly templatesService: ReportTemplatesService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN)
  create(@Body() createDto: CreateTemplateDto) {
    return this.templatesService.create(createDto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  findAll() {
    return this.templatesService.findAll();
  }

  @Get('default')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  findDefault() {
    return this.templatesService.findDefault();
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN)
  update(@Param('id') id: string, @Body() updateDto: UpdateTemplateDto) {
    return this.templatesService.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  delete(@Param('id') id: string) {
    return this.templatesService.delete(id);
  }

  @Post(':id/set-default')
  @Roles(UserRoleEnum.ADMIN)
  setDefault(@Param('id') id: string) {
    return this.templatesService.setDefault(id);
  }

  @Post('upload-logo')
  @Roles(UserRoleEnum.ADMIN)
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: './uploads/logos',
        filename: (req: any, file: Express.Multer.File, cb: any) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
          return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return {
      url: `/uploads/logos/${file.filename}`,
      filename: file.filename,
    };
  }
}
