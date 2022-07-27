import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { envSchema } from './common/validations/env.validation';
import { KeycloakModule, KeycloakProviders } from './configs/keycloak.config';
import { OrmModule } from './configs/typeorm.config';
import { S3Module } from './s3/s3.module';
import { StarAllelesModule } from './star-alleles/star-alleles.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: envSchema,
        }),
        OrmModule,
        S3Module,
        KeycloakModule,
        StarAllelesModule,
    ],

    controllers: [AppController],
    providers: [...KeycloakProviders],
})
export class AppModule {}
