const nodemailer = require('nodemailer');
const Database = require('./database');
const SSHService = require('./sshService');

class ServerMonitor {
  constructor() {
    this.db = new Database();
  }

  // Inicializar el monitor
  async initialize() {
    try {
      await this.db.connect();
      console.log('🚀 Monitor inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando:', error.message);
      throw error;
    }
  }

  async sendEmail(allServerStats) {
  const transporter = nodemailer.createTransport({
    host: '10.0.200.68',
    port: 25,
    secure: false,
    tls: { rejectUnauthorized: false }
  });

  // Crear el HTML con las estadísticas de todos los servidores
  let htmlContent = `
    <h1>Reporte de Espacio Data Domain - ${new Date().toISOString().split('T')[0]}</h1>
    <h3>Estadísticas de los Servidores</h3>
    <table border="1" cellpadding="5">
      <tr>
        <th>Hostname</th>
        <th>IP</th>
        <th>Tamaño Total (GB)</th>
        <th>Espacio Usado (GB)</th>
        <th>Espacio Disponible (GB)</th>
        <th>Porcentaje de Uso</th>
        <th>Espacio Limpio (GB)</th>
      </tr>`;

  // Agregar los datos de cada servidor en la tabla HTML
  for (const stats of allServerStats) {
    // Obtener el hostname e ip usando el id_servidor
    const serverData = await this.db.getServerById(stats.id_servidor);
    
    if (serverData) {
      htmlContent += `
        <tr>
          <td>${serverData.hostname}</td>
          <td>${serverData.ip}</td>
          <td>${stats.size_gb}</td>
          <td>${stats.used_gb}</td>
          <td>${stats.avail_gb}</td>
          <td>${stats.use_percent}%</td>
          <td>${stats.cleanable_gb}</td>
        </tr>`;
    }
  }

  htmlContent += `</table>`;

  const mailOptions = {
    from: 'igs_llupacca@cajaarequipa.pe',
    to: 'igs_llupacca@cajaarequipa.pe, kcabrerac@cajaarequipa.pe, ehidalgom@cajaarequipa.pe',
    subject: `Reporte de Espacio Data Domain - ${new Date().toISOString().split('T')[0]}`,
    html: htmlContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Correo enviado exitosamente');
    return { success: true };
  } catch (error) {
    console.error('Error al enviar correo:', error);
    return { success: false, error: error.message };
  }
}

  // Monitorear un servidor específico
  async monitorServer(serverConfig) {
    const sshService = new SSHService(serverConfig);
    
    try {
      console.log(`\n🔍 Monitoreando servidor: ${serverConfig.hostname} (${serverConfig.ip})`);
      
      // Obtener información del disco
      const diskInfo = await sshService.getDiskInfo();
      
      // Preparar datos para insertar
      const monitoringData = {
        id_servidor: serverConfig.id_servidor,
        size_gb: diskInfo.size_gb,
        used_gb: diskInfo.used_gb,
        avail_gb: diskInfo.avail_gb,
        use_percent: diskInfo.use_percent,
        cleanable_gb: diskInfo.cleanable_gb
      };

      // Insertar en la base de datos
      await this.db.insertMonitoreo(monitoringData);
      
      // Retornar objeto completo con info para el email
    return {
      ...monitoringData,
      hostname: serverConfig.hostname,
      ip: serverConfig.ip
    };
    } catch (error) {
      console.error(`❌ Error monitoreando ${serverConfig.hostname}:`, error.message);
      return null;
    }
  }

  // Ejecutar monitoreo de todos los servidores
  async runMonitoring() {
    try {
      console.log('\n🎯 Iniciando ciclo de monitoreo...');
      const startTime = new Date();

      // Obtener lista de servidores de la BD
      const servidores = await this.db.getServidores();
      console.log(`📋 Servidores encontrados: ${servidores.length}`);

      // Almacenar las estadísticas de todos los servidores
      const allServerStats = [];

      // Monitorear cada servidor
      for (const servidor of servidores) {
        const serverStats = await this.monitorServer(servidor);
        if (serverStats) {
          allServerStats.push(serverStats);
        }
      }

      const endTime = new Date();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`\n🏁 Ciclo de monitoreo completado en ${duration} segundos`);

      // Enviar un único correo con todas las estadísticas
      if (allServerStats.length > 0) {
        await this.sendEmail(allServerStats);
      } else {
        console.log("No se generaron estadísticas para enviar.");
      }
      
    } catch (error) {
      console.error('❌ Error en el ciclo de monitoreo:', error.message);
    }
  }

  // Cerrar conexiones
  async shutdown() {
    await this.db.disconnect();
    console.log('🛑 Monitor detenido');
  }
}

async function main() {
  const monitor = new ServerMonitor();

  try {
    await monitor.initialize();
    await monitor.runMonitoring();
    await monitor.shutdown();
    
  } catch (error) {
    console.error('💥 Error fatal:', error.message);
    await monitor.shutdown();
    process.exit(1);
  }
}

// Ejecutar el programa
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ServerMonitor;
