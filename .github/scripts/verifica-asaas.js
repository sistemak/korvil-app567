const fs = require('fs');
const https = require('https');

const API_KEY = process.env.ASAAS_API_KEY;
if (!API_KEY) {
  console.log('Sem ASAAS_API_KEY no Secrets');
  process.exit(0);
}

function asaasGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.asaas.com',
      path: path,
      method: 'GET',
      headers: { 'access_token': API_KEY }
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e){ resolve({}); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync('pagamentos')) fs.mkdirSync('pagamentos', {recursive:true});
  if (!fs.existsSync('pendentes')) fs.mkdirSync('pendentes', {recursive:true});

  // Pega todos PIX pendentes salvos
  const pendentes = fs.existsSync('pendentes') ? fs.readdirSync('pendentes').filter(f=>f.endsWith('.json')) : [];
  
  // Também busca últimas 20 cobranças no Asaas pra garantir
  const lista = await asaasGet('/v3/payments?limit=50&status=PENDING,RECEIVED,CONFIRMED');
  const payments = lista.data || [];

  for (const file of pendentes) {
    const pixId = file.replace('.json','');
    const payment = payments.find(p => p.externalReference === pixId);
    
    if (!payment) continue;
    
    console.log(`Verificando ${pixId} status Asaas: ${payment.status} valor: ${payment.value}`);

    // SÓ CONFIRMA QUANDO DINHEIRO CAIU DE VERDADE NA CONTA korvil.p@gmail.com
    if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
      // Cria arquivo de confirmado
      fs.writeFileSync(`pagamentos/${pixId}.json`, JSON.stringify({
        pago: true,
        pixId: pixId,
        asaasId: payment.id,
        status: payment.status,
        valor: payment.value,
        dataConfirmacao: new Date().toISOString(),
        contaAsaas: 'korvil.p@gmail.com'
      }, null, 2));
      
      console.log(`✅ PAGO REAL ${pixId} - dinheiro caiu na conta korvil.p@gmail.com`);
    }
    
    // Expiração 1h - apaga pendente se passou 1h
    try {
      const pend = JSON.parse(fs.readFileSync(`pendentes/${file}`,'utf8'));
      if (Date.now() - pend.criadoEm > 3600000) {
        fs.unlinkSync(`pendentes/${file}`);
        console.log(`Expirou ${pixId} - 1h`);
      }
    } catch(e){}
  }
}

main();
