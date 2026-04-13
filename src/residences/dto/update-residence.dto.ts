import { PartialType } from '@nestjs/swagger';
import { CreateResidenceDto } from './create-residence.dto';

export class UpdateResidenceDto extends PartialType(CreateResidenceDto) {}
