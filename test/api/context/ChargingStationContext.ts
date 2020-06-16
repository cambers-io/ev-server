import { ChargePointErrorCode, ChargePointStatus, OCPP15MeterValuesRequest, OCPP15TransactionData, OCPPAuthorizeResponse, OCPPBootNotificationResponse, OCPPDataTransferResponse, OCPPFirmwareStatus, OCPPFirmwareStatusNotificationResponse, OCPPHeartbeatResponse, OCPPLocation, OCPPMeasurand, OCPPMeterValue, OCPPMeterValuesRequest, OCPPMeterValuesResponse, OCPPReadingContext, OCPPStartTransactionResponse, OCPPStatusNotificationRequest, OCPPStatusNotificationResponse, OCPPStopTransactionResponse, OCPPUnitOfMeasure, OCPPValueFormat, OCPPVersion } from '../../../src/types/ocpp/OCPPServer';

import CentralServerService from '../client/CentralServerService';
import ChargingStation from '../../types/ChargingStation';
import Constants from '../../../src/utils/Constants';
import ContextDefinition from './ContextDefinition';
import OCPPService from '../ocpp/OCPPService';
import TenantContext from './TenantContext';
import Utils from '../../../src/utils/Utils';
import faker from 'faker';

interface MeterValueParams {
  energyActiveImportMeterValue: number;
  powerImportMeterValue?: number;
  powerImportL1MeterValue?: number;
  powerImportL2MeterValue?: number;
  powerImportL3MeterValue?: number;
  voltageMeterValue?: number;
  voltageL1MeterValue?: number;
  voltageL2MeterValue?: number;
  voltageL3MeterValue?: number;
  amperageMeterValue?: number;
  amperageL1MeterValue?: number;
  amperageL2MeterValue?: number;
  amperageL3MeterValue?: number;
  socMeterValue?: number;
  signedDataMeterValue?: string;
}

export default class ChargingStationContext {

  private chargingStation: ChargingStation;
  private ocppService: OCPPService;
  private tenantContext: TenantContext;
  private transactionsStarted: OCPPStartTransactionResponse[] = [];
  private transactionsStopped: OCPPStopTransactionResponse[] = [];

  constructor(chargingStation, tenantContext) {
    this.chargingStation = chargingStation;
    this.tenantContext = tenantContext;
  }

  async initialize(token: string = null) {
    this.ocppService = await this.tenantContext.getOCPPService(this.chargingStation.ocppVersion, token);
  }

  async cleanUpCreatedData() {
    // Clean up transactions
    for (const transaction of this.transactionsStarted) {
      if (transaction.transactionId) {
        const transactionResponse = await this.tenantContext.getAdminCentralServerService().transactionApi.readById(transaction.transactionId);
        if (transactionResponse.status === 200) {
          await this.tenantContext.getAdminCentralServerService().transactionApi.delete(transaction.transactionId);
        }
      }
    }
  }

  getChargingStation() {
    return this.chargingStation;
  }

  addTransactionStarted(transaction) {
    this.transactionsStarted.push(transaction);
  }

  addTransactionStopped(transaction) {
    this.transactionsStopped.push(transaction);
  }

  async authorize(tagId: string): Promise<OCPPAuthorizeResponse> {
    return this.ocppService.executeAuthorize(this.chargingStation.id, {
      idTag: tagId
    });
  }

  async readChargingStation(userService?: CentralServerService) {
    if (!userService) {
      userService = new CentralServerService(this.tenantContext.getTenant().subdomain, this.tenantContext.getUserContext(ContextDefinition.USER_CONTEXTS.DEFAULT_ADMIN));
    }
    return await userService.chargingStationApi.readById(this.chargingStation.id);
  }

  async sendHeartbeat(): Promise<OCPPHeartbeatResponse> {
    return await this.ocppService.executeHeartbeat(this.chargingStation.id, {});
  }

  async startTransaction(connectorId: number, tagId: string, meterStart: number, startDate: Date): Promise<OCPPStartTransactionResponse> {
    const response = await this.ocppService.executeStartTransaction(this.chargingStation.id, {
      connectorId: connectorId,
      idTag: tagId,
      meterStart: meterStart,
      timestamp: startDate.toISOString()
    });
    if (response) {
      this.addTransactionStarted(response);
    }
    return response;
  }

  async stopTransaction(transactionId: number, tagId: string, meterStop: number, stopDate: Date, transactionData?: OCPPMeterValue[] | OCPP15TransactionData): Promise<OCPPStopTransactionResponse> {
    // Check props
    const response = await this.ocppService.executeStopTransaction(this.chargingStation.id, {
      transactionId: transactionId,
      idTag: tagId,
      meterStop: meterStop,
      timestamp: stopDate.toISOString(),
      transactionData: transactionData
    });
    if (response) {
      this.addTransactionStopped(response);
    }
    return response;
  }

  public removeTransaction(transactionId: number) {
    for (let i = 0; i < this.transactionsStarted.length; i++) {
      const transaction = this.transactionsStarted[i];
      if (transaction.transactionId === transactionId) {
        this.transactionsStarted.splice(i, 1);
        break;
      }
    }
  }

  async sendConsumptionMeterValue(connectorId: number, transactionId: number, timestamp: Date, meterValues: MeterValueParams): Promise<OCPPMeterValuesResponse> {
    let meterValueRequest: OCPPMeterValuesRequest | OCPP15MeterValuesRequest;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === OCPPVersion.VERSION_16) {
      // Energy
      meterValueRequest = {
        connectorId: connectorId,
        transactionId: transactionId,
        meterValue: [{
          timestamp: timestamp.toISOString(),
          sampledValue: [
            {
              value: meterValues.energyActiveImportMeterValue.toString(),
              ...Constants.OCPP_ENERGY_ACTIVE_IMPORT_REGISTER_ATTRIBUTE,
            },
          ]
        }],
      };
      // Power
      if (meterValues.powerImportMeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportMeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_ATTRIBUTE,
        });
      }
      // Power L1
      if (meterValues.powerImportL1MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportL1MeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_L1_ATTRIBUTE,
        });
      }
      // Power L2
      if (meterValues.powerImportL2MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportL2MeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_L2_ATTRIBUTE,
        });
      }
      // Power L3
      if (meterValues.powerImportL3MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportL3MeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_L3_ATTRIBUTE,
        });
      }
      // Voltage
      if (meterValues.voltageMeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageMeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_ATTRIBUTE,
        });
      }
      // Voltage L1
      if (meterValues.voltageL1MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageL1MeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_L1_ATTRIBUTE,
        });
      }
      // Voltage L2
      if (meterValues.voltageL2MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageL2MeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_L2_ATTRIBUTE,
        });
      }
      // Voltage L3
      if (meterValues.voltageL3MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageL3MeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_L3_ATTRIBUTE,
        });
      }
      // Amperage
      if (meterValues.amperageMeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageMeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_ATTRIBUTE,
        });
      }
      // Amperage L1
      if (meterValues.amperageL1MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageL1MeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_L1_ATTRIBUTE,
        });
      }
      // Amperage L2
      if (meterValues.amperageL2MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageL2MeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_L2_ATTRIBUTE,
        });
      }
      // Amperage L3
      if (meterValues.amperageL3MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageL3MeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_L3_ATTRIBUTE,
        });
      }
      // Soc
      if (meterValues.socMeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.socMeterValue.toString(),
          ...Constants.OCPP_SOC_ATTRIBUTE,
        });
      }
    // OCPP 1.5 (only without SoC)
    } else {
      // Energy
      meterValueRequest = {
        connectorId: connectorId,
        transactionId: transactionId,
        values: {
          timestamp: timestamp.toISOString(),
          value: {
            $value: meterValues.energyActiveImportMeterValue.toString(),
            $attributes: Constants.OCPP_ENERGY_ACTIVE_IMPORT_REGISTER_ATTRIBUTE,
          }
        },
      };
    }
    // Execute
    return this.ocppService.executeMeterValues(this.chargingStation.id, meterValueRequest);
  }

  async sendBeginMeterValue(connectorId: number, transactionId: number, timestamp: Date, meterValues: MeterValueParams) {
    return this.sendBeginEndMeterValue(
      OCPPReadingContext.TRANSACTION_BEGIN, connectorId, transactionId, timestamp, meterValues);
  }

  async sendEndMeterValue(connectorId: number, transactionId: number, timestamp: Date, meterValues: MeterValueParams) {
    return this.sendBeginEndMeterValue(
      OCPPReadingContext.TRANSACTION_END, connectorId, transactionId, timestamp, meterValues);
  }

  async sendBeginEndMeterValue(context: OCPPReadingContext.TRANSACTION_BEGIN | OCPPReadingContext.TRANSACTION_END,
    connectorId: number, transactionId: number, timestamp: Date, meterValues: MeterValueParams): Promise<OCPPMeterValuesResponse> {
    let meterValueRequest: OCPPMeterValuesRequest | OCPP15MeterValuesRequest;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === OCPPVersion.VERSION_16) {
      // Energy
      meterValueRequest = {
        connectorId: connectorId,
        transactionId: transactionId,
        meterValue: [{
          timestamp: timestamp.toISOString(),
          sampledValue: [
            {
              value: meterValues.energyActiveImportMeterValue.toString(),
              ...Constants.OCPP_ENERGY_ACTIVE_IMPORT_REGISTER_ATTRIBUTE,
              context,
            }
          ]
        }],
      };
      // Power
      if (meterValues.powerImportMeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportMeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_ATTRIBUTE,
          context,
        });
      }
      // Power L1
      if (meterValues.powerImportL1MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportL1MeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_L1_ATTRIBUTE,
        });
      }
      // Power L2
      if (meterValues.powerImportL2MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportL2MeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_L2_ATTRIBUTE,
        });
      }
      // Power L3
      if (meterValues.powerImportL3MeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.powerImportL3MeterValue.toString(),
          ...Constants.OCPP_POWER_ACTIVE_IMPORT_L3_ATTRIBUTE,
        });
      }
      // Soc
      if (meterValues.socMeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.socMeterValue.toString(),
          ...Constants.OCPP_SOC_ATTRIBUTE,
          context,
        });
      }
      // Voltage
      if (meterValues.voltageMeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageMeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_ATTRIBUTE,
          context,
        });
      }
      // Voltage L1
      if (meterValues.voltageL1MeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageL1MeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_L1_ATTRIBUTE,
          context,
        });
      }
      // Voltage L2
      if (meterValues.voltageL2MeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageL2MeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_L2_ATTRIBUTE,
          context,
        });
      }
      // Voltage L3
      if (meterValues.voltageL3MeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.voltageL3MeterValue.toString(),
          ...Constants.OCPP_VOLTAGE_L3_ATTRIBUTE,
          context,
        });
      }
      // Amperage
      if (meterValues.amperageMeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageMeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_ATTRIBUTE,
          context,
        });
      }
      // Amperage L1
      if (meterValues.amperageL1MeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageL1MeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_L1_ATTRIBUTE,
          context,
        });
      }
      // Amperage L2
      if (meterValues.amperageL2MeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageL2MeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_L2_ATTRIBUTE,
          context,
        });
      }
      // Amperage L3
      if (meterValues.amperageL3MeterValue > 0) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.amperageL3MeterValue.toString(),
          ...Constants.OCPP_CURRENT_IMPORT_L3_ATTRIBUTE,
          context,
        });
      }
      // Signed Data
      if (meterValues.signedDataMeterValue) {
        meterValueRequest.meterValue[0].sampledValue.push({
          value: meterValues.signedDataMeterValue,
          format: OCPPValueFormat.SIGNED_DATA,
          context,
        });
      }
    // OCPP 1.5
    } else if (this.chargingStation.ocppVersion === OCPPVersion.VERSION_15) {
      // No Transaction Begin/End in this version
    }
    return this.ocppService.executeMeterValues(this.chargingStation.id, meterValueRequest);
  }

  async sendClockMeterValue(connectorId: number, transactionId: number, timestamp: Date, energyActiveImportMeterValue: number): Promise<OCPPMeterValuesResponse> {
    let response: OCPPMeterValuesResponse;
    // OCPP 1.6?
    if (this.chargingStation.ocppVersion === OCPPVersion.VERSION_16) {
      response = await this.ocppService.executeMeterValues(this.chargingStation.id, {
        connectorId: connectorId,
        transactionId: transactionId,
        meterValue: [{
          timestamp: timestamp.toISOString(),
          sampledValue: [{
            value: energyActiveImportMeterValue.toString(),
            ...Constants.OCPP_ENERGY_ACTIVE_IMPORT_REGISTER_ATTRIBUTE,
            context: OCPPReadingContext.SAMPLE_CLOCK
          }]
        }],
      });
      // OCPP 1.5
    } else {
      response = await this.ocppService.executeMeterValues(this.chargingStation.id, {
        connectorId: connectorId,
        transactionId: transactionId,
        values: {
          timestamp: timestamp.toISOString(),
          value: {
            $attributes: {
              ...Constants.OCPP_ENERGY_ACTIVE_IMPORT_REGISTER_ATTRIBUTE,
              context: OCPPReadingContext.SAMPLE_CLOCK
            },
            $value: energyActiveImportMeterValue.toString()
          }
        },
      });
    }
    return response;
  }

  async setConnectorStatus(connector: OCPPStatusNotificationRequest): Promise<OCPPStatusNotificationResponse> {
    if (!Utils.objectHasProperty(connector, 'connectorId')) {
      connector.connectorId = 1;
    }
    if (!Utils.objectHasProperty(connector, 'status')) {
      connector.status = ChargePointStatus.AVAILABLE;
    }
    if (!Utils.objectHasProperty(connector, 'errorCode')) {
      connector.errorCode = ChargePointErrorCode.NO_ERROR;
    }
    if (!Utils.objectHasProperty(connector, 'timestamp')) {
      connector.timestamp = new Date().toISOString();
    }
    const response = await this.ocppService.executeStatusNotification(this.chargingStation.id, connector);
    this.chargingStation.connectors[connector.connectorId - 1].status = connector.status;
    this.chargingStation.connectors[connector.connectorId - 1].errorCode = connector.errorCode;
    return response;
  }

  async transferData(data): Promise<OCPPDataTransferResponse> {
    return this.ocppService.executeDataTransfer(this.chargingStation.id, data);
  }

  async sendBootNotification(): Promise<OCPPBootNotificationResponse> {
    return this.ocppService.executeBootNotification(
      this.chargingStation.id, {
        chargeBoxSerialNumber: this.chargingStation.chargeBoxSerialNumber,
        chargePointModel: this.chargingStation.chargePointModel,
        chargePointSerialNumber: this.chargingStation.chargePointSerialNumber,
        chargePointVendor: this.chargingStation.chargePointVendor,
        firmwareVersion: this.chargingStation.firmwareVersion
      }
    );
  }

  async sendFirmwareStatusNotification(status: OCPPFirmwareStatus): Promise<OCPPFirmwareStatusNotificationResponse> {
    return this.ocppService.executeFirmwareStatusNotification(
      this.chargingStation.id, { status: status }
    );
  }

  getConfiguration() {
    const configuration: any = {
      'stationTemplate': {
        'baseName': 'CS-' + faker.random.alphaNumeric(10),
        'chargePointModel': this.chargingStation.chargePointModel,
        'chargePointVendor': this.chargingStation.chargePointVendor,
        'power': [7200, 16500, 22000, 50000],
        'powerUnit': 'W',
        'numberOfConnectors': this.chargingStation.connectors.length,
        'randomConnectors': false,
        'Configuration': {
          'NumberOfConnectors': this.chargingStation.connectors.length,
          'param1': 'test',
          'meterValueInterval': 60
        },
        'AutomaticTransactionGenerator': {
          'enable': true,
          'minDuration': 70,
          'maxDuration': 180,
          'minDelayBetweenTwoTransaction': 30,
          'maxDelayBetweenTwoTransaction': 60,
          'probabilityOfStart': 1,
          'stopAutomaticTransactionGeneratorAfterHours': 0.3
        },
        'Connectors': {}
      }
    };
    this.chargingStation.connectors.forEach((connector) => {
      configuration.Connectors[connector.connectorId] = {
        'MeterValues': [
          Constants.OCPP_SOC_ATTRIBUTE,
          {
            'unit': OCPPUnitOfMeasure.WATT_HOUR,
            'context': OCPPReadingContext.SAMPLE_PERIODIC
          }
        ]
      };
    });
    return configuration;
  }
}
