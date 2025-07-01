const oracledb = require('oracledb');
require('dotenv').config();

class Database {
  constructor() {
    this.connection = null;
  }

  // Conectar a la base de datos
  async connect() {
    try {
      this.connection = await oracledb.getConnection({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECTION_STRING
      });
      console.log('✅ Conectado a Oracle Database');
      return this.connection;
    } catch (error) {
      console.error('❌ Error conectando a Oracle:', error.message);
      throw error;
    }
  }

  // Obtener todos los servidores activos
  async getServidores() {
    try {
      const result = await this.connection.execute(
        'SELECT id_servidor, hostname, ip, usuario, contraseña, puerto FROM servidores ORDER BY hostname'
      );
      return result.rows.map(row => ({
        id_servidor: row[0],
        hostname: row[1],
        ip: row[2],
        usuario: row[3],
        contraseña: row[4],
        puerto: row[5]
      }));
    } catch (error) {
      console.error('❌ Error obteniendo servidores:', error.message);
      throw error;
    }
  }

  // Insertar datos de monitoreo
async insertMonitoreo(data) {
  const sql = `
    INSERT INTO monitoreo (id_servidor, size_gb, used_gb, avail_gb, use_percent, cleanable_gb)
    VALUES (:id_servidor, :size_gb, :used_gb, :avail_gb, :use_percent, :cleanable_gb)
  `;

  try {
    // Log detallado de los valores antes de insertar
    console.log(`\n📝 Datos a insertar para servidor ID ${data.id_servidor}:`);
    console.log(`   id_servidor: ${data.id_servidor} (tipo: ${typeof data.id_servidor})`);
    console.log(`   size_gb: ${data.size_gb} (tipo: ${typeof data.size_gb})`);
    console.log(`   used_gb: ${data.used_gb} (tipo: ${typeof data.used_gb})`);
    console.log(`   avail_gb: ${data.avail_gb} (tipo: ${typeof data.avail_gb})`);
    console.log(`   use_percent: ${data.use_percent} (tipo: ${typeof data.use_percent})`);
    console.log(`   cleanable_gb: ${data.cleanable_gb} (tipo: ${typeof data.cleanable_gb})`);

    // Verificar si algún valor es NaN o Infinity
    const values = [data.size_gb, data.used_gb, data.avail_gb, data.use_percent, data.cleanable_gb];
    const problematicos = values.filter(v => isNaN(v) || !isFinite(v));
    if (problematicos.length > 0) {
      console.log(`⚠️ Valores problemáticos detectados: ${problematicos}`);
    }

    await this.connection.execute(sql, data);
    await this.connection.commit();
    console.log(`✅ Datos insertados para servidor ID: ${data.id_servidor}`);
  } catch (error) {
    console.error('\n❌ Error insertando datos:', error.message);
    console.error('📊 Datos completos que causaron el error:');
    console.error(JSON.stringify(data, null, 2));
    
    // Verificar límites específicos para NUMBER(18,2)
    console.log('\n🔍 Verificando límites para NUMBER(18,2):');
    const limite18_2 = 9999999999999999.99;
    const limite5_2 = 999.99;
    
    if (data.size_gb > limite18_2) console.log(`   ❌ size_gb (${data.size_gb}) excede límite NUMBER(18,2)`);
    if (data.used_gb > limite18_2) console.log(`   ❌ used_gb (${data.used_gb}) excede límite NUMBER(18,2)`);
    if (data.avail_gb > limite18_2) console.log(`   ❌ avail_gb (${data.avail_gb}) excede límite NUMBER(18,2)`);
    if (data.use_percent > limite5_2) console.log(`   ❌ use_percent (${data.use_percent}) excede límite NUMBER(5,2)`);
    if (data.cleanable_gb > limite18_2) console.log(`   ❌ cleanable_gb (${data.cleanable_gb}) excede límite NUMBER(18,2)`);
    
    throw error;
  }
}

  // Cerrar conexión
  async disconnect() {
    if (this.connection) {
      try {
        await this.connection.close();
        console.log('✅ Desconectado de Oracle Database');
      } catch (error) {
        console.error('❌ Error desconectando:', error.message);
      }
    }
  }
}

// ¡Esta línea faltaba!
module.exports = Database;