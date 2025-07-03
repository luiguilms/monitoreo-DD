const nodemailer = require('nodemailer');
const Database = require('./database');
const SSHService = require('./sshService');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
// Configuración para generar gráficos como imágenes
const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
  width: 800, 
  height: 400,
  backgroundColour: 'white'
});

// Función para generar gráfico como imagen base64
async function generarGraficoImagen(historial, hostname) {
    const labels = historial.map(item => 
        new Date(item.fecha).toLocaleDateString('es-PE', { weekday: 'short', month: 'short', day: 'numeric' })
    );
    
    const dataUsed = historial.map(item => parseFloat(item.used_gb));
    const dataTotal = historial.map(item => parseFloat(item.size_gb));

    const configuration = {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Espacio Total (GB)',
                    data: dataTotal,
                    borderColor: '#36A2EB',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Espacio Usado (GB)',
                    data: dataUsed,
                    borderColor: '#FF6384',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: false,
            plugins: {
                title: {
                    display: true,
                    text: `Evolución del Espacio - ${hostname}`,
                    font: { size: 16 }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Espacio (GB)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Fecha'
                    }
                }
            }
        }
    };

    try {
        const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);
        return imageBuffer.toString('base64');
    } catch (error) {
        console.error(`❌ Error generando gráfico para ${hostname}:`, error);
        return null;
    }
}
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

    console.log('📊 Generando gráficos como imágenes...');
    
    // Generar gráficos como imágenes base64
    const attachments = [];
    let graficosHTML = '';
    
    for (let i = 0; i < allServerStats.length; i++) {
        const server = allServerStats[i];
        const historial = await this.db.getHistorialEspacio(server.id_servidor);
        
        if (historial && historial.length > 0) {
            const imagenBase64 = await generarGraficoImagen(historial, server.hostname);
            
            if (imagenBase64) {
                const imageName = `grafico_${server.hostname.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
                
                // Agregar como attachment
                attachments.push({
                    filename: imageName,
                    content: imagenBase64,
                    encoding: 'base64',
                    cid: `grafico_${i}` // Content ID para referenciar en HTML
                });
                
                // Agregar HTML que referencia la imagen
                graficosHTML += `
                <div style="margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                    <h2>${server.hostname} (${server.ip})</h2>
                    <div style="text-align: center;">
                        <img src="cid:grafico_${i}" alt="Gráfico ${server.hostname}" style="max-width: 100%; height: auto;">
                    </div>
                    <p style="color: #666; font-size: 12px; text-align: center;">
                        Evolución del espacio en disco de los últimos 7 días
                    </p>
                </div>`;
            } else {
                graficosHTML += `
                <div style="margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                    <h2>${server.hostname} (${server.ip})</h2>
                    <p style="color: #ff6b6b; text-align: center;">❌ No se pudo generar el gráfico</p>
                </div>`;
            }
        } else {
            graficosHTML += `
            <div style="margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 20px;">
                <h2>${server.hostname} (${server.ip})</h2>
                <p style="color: #ffa726; text-align: center;">⚠️ Sin datos históricos suficientes</p>
            </div>`;
        }
    }

    const mailOptions = {
        from: 'igs_llupacca@cajaarequipa.pe',
        to: 'igs_llupacca@cajaarequipa.pe, ehidalgom@cajaarequipa.pe, kcabrerac@cajaarequipa.pe',
        subject: `Reporte de Espacio Data Domain - ${new Date().toLocaleDateString('es-PE')}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto;">
            <h1 style="color: #2c3e50; text-align: center;">📊 Reporte de Espacio Data Domain</h1>
            <p style="text-align: center; color: #7f8c8d; font-size: 14px;">
                Fecha: ${new Date().toLocaleDateString('es-PE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            
            <h2 style="color: #34495e;">📈 Estadísticas Actuales</h2>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin-bottom: 30px; width: 100%; font-size: 12px;">
                <thead>
                    <tr style="background-color: #3498db; color: white;">
                        <th>Hostname</th>
                        <th>IP</th>
                        <th>Total (GB)</th>
                        <th>Usado (GB)</th>
                        <th>Disponible (GB)</th>
                        <th>% Uso</th>
                        <th>Limpieza (GB)</th>
                    </tr>
                </thead>
                <tbody>
                    ${allServerStats.map(server => {
                        const colorRow = server.use_percent >= 95 ? '#ffebee' : 
                                       server.use_percent >= 90 ? '#fff3e0' : '#ffffff';
                        const colorPercent = server.use_percent >= 95 ? '#d32f2f' : 
                                           server.use_percent >= 90 ? '#f57c00' : '#388e3c';
                        
                        return `
                        <tr style="background-color: ${colorRow};">
                            <td><strong>${server.hostname}</strong></td>
                            <td>${server.ip}</td>
                            <td>${server.size_gb.toLocaleString('es-PE')}</td>
                            <td>${server.used_gb.toLocaleString('es-PE')}</td>
                            <td>${server.avail_gb.toLocaleString('es-PE')}</td>
                            <td style="color: ${colorPercent}; font-weight: bold;">${server.use_percent}%</td>
                            <td>${server.cleanable_gb.toLocaleString('es-PE')}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            
            <h2 style="color: #34495e;">📊 Evolución Histórica (Últimos 7 días)</h2>
            ${graficosHTML}
            
            <div style="margin-top: 30px; padding: 15px; background-color: #ecf0f1; border-left: 4px solid #3498db;">
                <p style="margin: 0; color: #2c3e50; font-size: 12px;">
                    🤖 <strong>Reporte generado automáticamente</strong><br>
                    Sistema de Monitoreo Data Domain - Caja Arequipa<br>
                    Hora de generación: ${new Date().toLocaleString('es-PE')}
                </p>
            </div>
        </div>`,
        attachments: attachments
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📨 Correo con ${attachments.length} gráficos enviado exitosamente`);
    } catch (error) {
        console.error('❌ Error al enviar correo:', error);
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
      let shouldSendEmail = false;

      // ===== SOLUCIÓN DEFINITIVA =====
    // 1. Obtener hora local REAL del sistema
    const today = new Date();
    
    // 2. Formatear como hora peruana exacta
    const options = {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };
    
    const horaPeru = today.toLocaleString('es-PE', options);
    const diaSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][today.getDay()];
    
    console.log('⏰ Hora exacta de tu PC:');
    console.log('- Fecha completa:', today.toString());
    console.log('- Hora Perú exacta:', horaPeru);
    console.log('- Día de la semana:', diaSemana);
    // ==============================
      const isFriday = today.getDay() === 5; // 0=Domingo, 5=Viernes
      const threshold = isFriday ? 93 : 95;
      console.log(`📅 Día de la semana: ${isFriday ? 'Viernes' : 'Otro día'}, Umbral: ${threshold}%`);

      // Monitorear cada servidor
      for (const servidor of servidores) {
        const serverStats = await this.monitorServer(servidor);
        if (serverStats) {
          allServerStats.push(serverStats);

          // Verificar si supera el umbral
          if (serverStats.use_percent >= threshold) {
            console.log(`⚠️ Servidor ${servidor.hostname} supera umbral (${serverStats.use_percent}% >= ${threshold}%)`);
            shouldSendEmail = true;
          }
        }
      }

      const endTime = new Date();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      console.log(`\n🏁 Ciclo de monitoreo completado en ${duration} segundos`);

      // Enviar email solo si se superó el umbral en algún servidor
      if (shouldSendEmail && allServerStats.length > 0) {
        console.log(`📨 Enviando email porque algún servidor superó el umbral del ${threshold}%`);
        await this.sendEmail(allServerStats);
      } else {
        console.log("📭 No se envió email - ningún servidor superó el umbral o no hay datos");
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
