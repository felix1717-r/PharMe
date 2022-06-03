import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export abstract class FindQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    offset: number;

    @IsOptional()
    @IsString()
    abstract sortby: string;

    @IsOptional()
    @IsIn(['asc', 'desc'])
    orderby: string;
}
