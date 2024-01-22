import { Injectable } from '@nestjs/common';
import * as xlsx from 'xlsx';
import * as csv from 'csv-parser';
import * as fs from 'fs';

@Injectable()
export class AppService {

  async processFile(file: any, fileType: 'xlsx' | 'csv') {
    const filePath = `./uploads/${file.filename}`;
    const data = fileType === 'xlsx' ? this.processXLSX(filePath) : await this.processCSV(filePath);

    const mrr = this.calculateMRR(data);
    const cr = this.calculateCR(data);

    if(this.verifiyObject(mrr) && this.verifiyObject(cr)) return this.formatMetrics({ mrr, cr });
  }

  private processXLSX(filePath: string) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { raw: false });
  }

  private processCSV(filePath: string) {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  private calculateMRR(data) {
    const mrrPorMes = {};
    
    data.forEach(subscriber => {
      const statusAssinatura = subscriber['status'];
      const dataInicio = new Date(subscriber['data início']);
      const dataStatus = new Date(subscriber['data status']);
      const valorAssinatura = parseFloat(subscriber['valor']);
      const intervaloCobrancas = subscriber['cobrada a cada X dias'];
      const quantCobrancas = subscriber['quantidade cobranças'];

      // Adicionar o valor da assinatura para cada mês de acordo com a quantidade de cobranças. 
      if (statusAssinatura === 'Ativa' || statusAssinatura === 'Cancelada') {
        if(intervaloCobrancas === '30') {
          for (let i = 0; i < quantCobrancas; i++) {
            const mesAno = `${(dataInicio.getMonth() + i) % 12 + 1}/${dataInicio.getFullYear()}`;
            mrrPorMes[mesAno] = (mrrPorMes[mesAno] || 0) + valorAssinatura;
          }
        } else { // Se a cobrança não for mensal, adicionar o valor no mês único da compra.
          const mesAno = `${dataInicio.getMonth() + 1}/${dataInicio.getFullYear()}`;
          mrrPorMes[mesAno] = (mrrPorMes[mesAno] || 0) + valorAssinatura;
        }
      }
      if (statusAssinatura === 'Atrasada') { // Adcionar o valor pago nos meses entre o inicio e o mês de atraso.
        const diferencaMeses = (dataStatus.getFullYear() - dataInicio.getFullYear()) * 12 + (dataStatus.getMonth() - dataInicio.getMonth());
        for (let i = 0; i < diferencaMeses; i++) {
          const mesAno = `${(dataInicio.getMonth() + i) % 12 + 1}/${dataInicio.getFullYear()}`;
          mrrPorMes[mesAno] = (mrrPorMes[mesAno] || 0) + valorAssinatura;
        }
      }
    });

    return mrrPorMes;
  }

  private calculateCR(data) {
    const clientesAtivosPorMes = {};
    const clientesCanceladosPorMes = {};
    const churnRatePorMes = {};
    
    data.forEach(subscriber => {
      const dataInicio = new Date(subscriber['data início']);
      const dataStatus = new Date(subscriber['data status']);
      const status = subscriber['status'];
      
      // Passar por todos os clientes e adicioanr o mês em que ele iniciou (ficou ativo).
      const mesAnoInicio = `${dataInicio.getMonth() + 1}/${dataInicio.getFullYear()}`;
      clientesAtivosPorMes[mesAnoInicio] = (clientesAtivosPorMes[mesAnoInicio] || 0) + 1;
      if (status === 'Cancelada') { // Caso o status for 'Cancelada', adicionar o mês em que o cliente cancelou.
        const mesAnoStatus = `${dataStatus.getMonth() + 1}/${dataStatus.getFullYear()}`;
        clientesCanceladosPorMes[mesAnoStatus] = (clientesCanceladosPorMes[mesAnoStatus] || 0) + 1;
      }
    });
    
    // Tendo uma lista dos clientes ativos no início de cada MÊS/ANO, e cancelados de cada MÊS/ANO... podemos fazer o cálculo do CR pegando os valores correspondentes entre as listas. -> ex: clientesAtivos[03/2022] com clientesCancelados[03/2022].
    for (const mesAno in clientesAtivosPorMes) {
      if (clientesAtivosPorMes.hasOwnProperty(mesAno)) {
        const clientesAtivos = clientesAtivosPorMes[mesAno];
        const clientesCancelados = clientesCanceladosPorMes[mesAno] || 0;
        const churnRate = (clientesCancelados / clientesAtivos) * 100;
        churnRatePorMes[mesAno] = churnRate;
      }
    }

    return churnRatePorMes;
  }

  private verifiyObject(object) {
    return Object.keys(object).length > 0 || Object.values(object).length > 0;
  }

  private formatMetrics(results) {
    const { mrr, cr } = results;
    const mrrKeys = this.organizeDate(Object.keys(mrr));
    const mrrValues = this.organizeValue(mrrKeys.map(key => mrr[key]));
    const crKeys = this.organizeDate(Object.keys(cr));
    const crValues = crKeys.map(key => cr[key]);

    return { mrr: { keys: mrrKeys, values: mrrValues }, cr: { keys: crKeys, values: crValues } };
  }

  private organizeDate(keys) {
    return keys.sort((a, b) => {
      const [aMonth, aYear] = a.split('/').map(Number);
      const [bMonth, bYear] = b.split('/').map(Number);
      return aYear !== bYear ? aYear - bYear : aMonth - bMonth;
    });
  };

  private organizeValue(values) {
    return values.map(value => parseFloat(value.toFixed(2)));
  }
}
