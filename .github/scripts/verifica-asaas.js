const fs = require('fs');
const https = require('https');

const API_KEY = process.env.ASAAS_API_KEY;
if (!API_KEY) {
  console.log('SEM ASAAS_API_KEY - configure em Settings > Secrets > Actions');
  process.exit(0);
}

function asaasGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.asaas.com',
      path: path,
      method: 'GET',
      headers: { 
        'access_token': API_KEY,
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { 
          const json = JSON.parse(data);
          resolve(json);
        } catch(e){ 
          console.log('Erro parse Asaas:', data.slice(0,200));
          resolve({}); 
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync('pagamentos')) fs.mkdirSync('pagamentos', {recursive:true});
  if (!fs.existsSync('pendentes')) fs.mkdirSync('pendentes', {recursive:true});

  console.log('Buscando pagamentos pendentes na Asaas conta korvil.p@gmail.com...');

  // Busca últimos 100 pagamentos PENDING e RECEIVED na Asaas
  const lista = await asaasGet('/v3/payments?limit=100&status=PENDING,RECEIVED,CONFIRMED,OVERDUE');
  const payments = lista.data || [];
  
  console.log(`Achou ${payments.length} pagamentos na Asaas`);

  for (const payment of payments) {
    const pixId = payment.externalReference;
    
    // Só processa nossos PIX KORVIL- ou KVL-
    if (!pixId || (!pixId.startsWith('KORVIL-') && !pixId.startsWith('KVL'))) continue;

    console.log(`Verificando ${pixId} | Status Asaas: ${payment.status} | Valor: ${payment.value} | Asaas ID: ${payment.id}`);

    // SÓ CONFIRMA QUANDO DINHEIRO CAIU DE VERDADE NA CONTA korvil.p@gmail.com
    if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
      
      // Se já existe arquivo de pago, pula
      if (fs.existsSync(`pagamentos/${pixId}.json`)) {
        console.log(`Já confirmado antes: ${pixId}`);
        continue;
      }

      const confirmado = {
        pago: true,
        pixId: pixId,
        asaasId: payment.id,
        status: payment.status,
        valor: payment.value,
        netValue: payment.netValue,
        billingType: payment.billingType,
        dataConfirmacao: new Date().toISOString(),
        dataPagamentoAsaas: payment.paymentDate || payment.clientPaymentDate,
        contaAsaas: 'korvil.p@gmail.com',
        confirmadoReal: true,
        mensagem: 'Dinheiro caiu de verdade na conta Asaas korvil.p@gmail.com'
      };

      fs.writeFileSync(`pagamentos/${pixId}.json`, JSON.stringify(confirmado, null, 2));
      console.log(`✅ CONFIRMADO REAL ${pixId} - R$ ${payment.value} caiu em korvil.p@gmail.com`);

      // Remove pendente se existir
      if (fs.existsSync(`pendentes/${pixId}.json`)) {
        fs.unlinkSync(`pendentes/${pixId}.json`);
      }

    } else if (payment.status === 'PENDING' || payment.status === 'OVERDUE') {
      // Ainda pendente - verifica se expirou 1h
      const pendPath = `pendentes/${pixId}.json`;
      if (fs.existsSync(pendPath)) {
        try {
          const pend = JSON.parse(fs.readFileSync(pendPath,'utf8'));
          if (Date.now() - pend.criadoEm > 3600000) {
            fs.unlinkSync(pendPath);
            console.log(`Expirou 1h ${pixId} - removido`);
          }
        } catch(e){}
      }
    }
  }

  // Limpa pendentes antigos 1h+
  const pendentes = fs.readdirSync('pendentes').filter(f=>f.endsWith('.json'));
  for (const file of pendentes) {
    try {
      const pend = JSON.parse(fs.readFileSync(`pendentes/${file}`,'utf8'));
      if (Date.now() - pend.criadoEm > 3600000) {
        fs.unlinkSync(`pendentes/${file}`);
        console.log(`Limpou expirado ${file}`);
      }
    } catch(e){
      // arquivo invalido, apaga
      try { fs.unlinkSync(`pendentes/${file}`); } catch(e2){}
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
