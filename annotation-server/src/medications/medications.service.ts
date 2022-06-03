import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as JSONStream from 'JSONStream';
import { FindOneOptions, IsNull, Like, Not, Repository } from 'typeorm';

import { fetchSpreadsheetCells } from '../common/google-sheets';
import { DrugDto } from './dtos/drugbank.dto';
import { Medication, MedicationSearchView } from './medication.entity';

@Injectable()
export class MedicationsService {
    private readonly logger = new Logger(MedicationsService.name);

    constructor(
        private configService: ConfigService,
        @InjectRepository(Medication)
        private medicationRepository: Repository<Medication>,
    ) {}

    async findAll(
        limit: number,
        offset: number,
        search: string,
        sortBy: string,
        orderBy: string,
    ): Promise<[Medication[], number]> {
        return await this.medicationRepository.findAndCount({
            where: { name: Like(`%${search}%`) },
            take: limit,
            skip: offset,
            order: {
                [sortBy]: orderBy === 'asc' ? 'ASC' : 'DESC',
            },
        });
    }

    getWithGuidelines(): Promise<Medication[]> {
        return this.medicationRepository.find({
            where: {
                guidelines: {
                    id: Not(IsNull()),
                },
            },
            relations: [
                'guidelines',
                'guidelines.genePhenotype.phenotype',
                'guidelines.genePhenotype.geneSymbol',
            ],
        });
    }

    getOne(options: FindOneOptions<Medication>): Promise<Medication> {
        return this.medicationRepository.findOneOrFail(options);
    }

    getDetails(id: number): Promise<Medication> {
        return this.getOne({
            where: { id },
            relations: [
                'guidelines',
                'guidelines.genePhenotype.phenotype',
                'guidelines.genePhenotype.geneSymbol',
            ],
        }).catch(() => {
            throw new NotFoundException('Medication could not be found!');
        });
    }

    findMatchingMedications(query: string): Promise<Medication[]> {
        return this.medicationRepository
            .createQueryBuilder('medication')
            .select([
                'medication.id',
                'medication.name',
                'medication.description',
                'medication.drugclass',
                'medication.indication',
            ])
            .leftJoinAndSelect(
                MedicationSearchView,
                'searchView',
                'searchView.id = medication.id',
            )
            .where('searchView.searchString ilike :searchString', {
                searchString: `%${query}%`,
            })
            .orderBy('searchView.priority', 'ASC')
            .getMany();
    }

    async fetchAllMedications(): Promise<void> {
        await this.clearAllMedicationData();
        const jsonPath = await this.getJSONfromZip();
        this.logger.log('Extracting medications from JSON ...');
        const drugs = await this.getDataFromJSON(jsonPath);
        this.logger.log(
            'Fetching additional medication data from Google Sheet ...',
        );
        const [medicationNames, drugClasses, indications] =
            await fetchSpreadsheetCells(
                this.configService.get<string>('GOOGLESHEET_ID'),
                this.configService.get<string>('GOOGLESHEET_APIKEY'),
                [
                    this.configService.get<string>(
                        'GOOGLESHEET_RANGE_MEDICATIONS',
                    ),
                    this.configService.get<string>(
                        'GOOGLESHEET_RANGE_DRUGCLASSES',
                    ),
                    this.configService.get<string>(
                        'GOOGLESHEET_RANGE_INDICATIONS',
                    ),
                ],
            );
        const spreadsheetMedications = new Map<
            string,
            { drugClass?: string; indication?: string }
        >();
        for (let row = 0; row < medicationNames.length; row++) {
            const drugClass = drugClasses[row]?.[0].value;
            const indication = indications[row]?.[0].value;
            const medicationName = medicationNames[row][0].value;
            if (!medicationName || (!drugClass && !indication)) continue;
            spreadsheetMedications.set(medicationName.toLowerCase(), {
                drugClass: drugClass,
                indication: indication,
            });
        }
        this.logger.log('Writing to database ...');
        const medications = drugs.map((drug) => {
            const medication = Medication.fromDrug(drug);
            if (spreadsheetMedications.has(medication.name.toLowerCase())) {
                const spreadsheetMedication = spreadsheetMedications.get(
                    medication.name.toLowerCase(),
                );
                medication.drugclass = spreadsheetMedication.drugClass?.trim();
                medication.indication =
                    spreadsheetMedication.indication?.trim();
            }
            return medication;
        });
        const savedMedications = await this.medicationRepository.save(
            medications,
        );
        this.logger.log(
            `Successfully saved ${savedMedications.length} medications!`,
        );
    }

    async clearAllMedicationData(): Promise<void> {
        await this.medicationRepository.delete({});
    }

    getJSONfromZip(): Promise<string> {
        const jsonPath = path.join(os.tmpdir(), 'drugbank-data.json');
        const proc = getOsSpecificPyProcess(this.configService);

        proc.on('error', (error) => {
            this.logger.error(error);
        });
        proc.stdout.on('data', (data: string) => {
            this.logger.log(data.toString().replace(/\n\r?/, ''));
        });
        proc.stderr.on('data', (data: string) => {
            this.logger.error(data.toString().replace(/\n\r?/, ''));
        });
        return new Promise((resolve, reject) => {
            proc.on('exit', (code) => {
                if (code === 0) resolve(jsonPath);
                else reject(`Subprocess exited with ${code}.`);
            });
        });

        function getOsSpecificPyProcess(
            configService: ConfigService<Record<string, unknown>, false>,
        ) {
            if (process.platform == 'win32')
                return spawn('python', [
                    path.join(__dirname, './scripts/zipped-xml-to-json'),
                    configService.get<string>('DRUGBANK_ZIP'),
                    configService.get<string>('DRUGBANK_XML'),
                    jsonPath,
                ]);

            return spawn(path.join(__dirname, './scripts/zipped-xml-to-json'), [
                configService.get<string>('DRUGBANK_ZIP'),
                configService.get<string>('DRUGBANK_XML'),
                jsonPath,
            ]);
        }
    }

    getDataFromJSON(path: string): Promise<DrugDto[]> {
        const fileStream = fs.createReadStream(path);
        const jsonStream = fileStream.pipe(JSONStream.parse('drugbank.drug.*'));
        const drugs: Array<DrugDto> = [];
        const clearLine = () => {
            process.stdout.write(`\r${String.fromCharCode(27)}[0J`);
        };
        jsonStream.on('data', (drug: DrugDto) => {
            if (!(drugs.length % 50)) {
                clearLine();
                process.stdout.write(`${drugs.length} drugs parsed ...`);
            }
            drugs.push(drug);
        });
        return new Promise<DrugDto[]>((resolve, reject) => {
            fileStream.on('error', (error) => {
                clearLine();
                reject(error);
            });
            jsonStream.on('error', (error) => {
                clearLine();
                reject(error);
            });
            jsonStream.on('end', () => {
                clearLine();
                resolve(drugs);
            });
        });
    }
}
