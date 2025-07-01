const { Client } = require('ssh2');

class SSHService {
  constructor(serverConfig) {
    this.config = serverConfig;
  }

  // Ejecutar comando por SSH
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        console.log(`🔗 Conectado por SSH a ${this.config.ip}`);
        
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let output = '';
          let errorOutput = '';

          stream.on('close', (code, signal) => {
            conn.end();
            if (code === 0) {
              resolve(output);
            } else {
              reject(new Error(`Comando falló con código ${code}: ${errorOutput}`));
            }
          });

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      // Conectar por SSH
      conn.connect({
        host: this.config.ip,
        port: this.config.puerto,
        username: this.config.usuario,
        password: this.config.contraseña
      });
    });
  }

  // Obtener información de disco con df -h
  async getDiskInfo() {
    try {
      console.log(`📊 Ejecutando 'df -h' en ${this.config.hostname}...`);
      const output = await this.executeCommand('df -h');
      return this.parseDfOutput(output);
    } catch (error) {
      console.error(`❌ Error obteniendo info de disco de ${this.config.hostname}:`, error.message);
      throw error;
    }
  }

  // Parsear la salida del comando df -h
parseDfOutput(output) {
  const lines = output.trim().split('\n');
  
  // Buscar la línea que contiene "/data: post-comp"
  for (const line of lines) {
    if (line.includes('/data: post-comp')) {
      console.log(`📄 Línea encontrada: ${line}`);
      
      // Dividir la línea en columnas usando múltiples espacios como separador
      const columns = line.trim().split(/\s+/);
      console.log(`🔍 Columnas parseadas (${columns.length}):`, columns);
      
      // Mostrar cada columna numerada para debug
      columns.forEach((col, index) => {
        console.log(`   [${index}]: "${col}"`);
      });
      
      if (columns.length >= 7) {
        // Mapear correctamente las columnas:
        // [0] = "/data:" (parte del nombre del recurso)
        // [1] = "post-comp" (parte del nombre del recurso)
        // [2] = size_gb (tamaño total)
        // [3] = used_gb (espacio usado)
        // [4] = avail_gb (espacio disponible)
        // [5] = use_percent (porcentaje de uso con %)
        // [6] = cleanable_gb (datos limpiables)
        
        const result = {
          size_gb: this.parseSize(columns[2]),      // Corregido: era columns[1]
          used_gb: this.parseSize(columns[3]),      // Corregido: era columns[2]
          avail_gb: this.parseSize(columns[4]),     // Corregido: era columns[3]
          use_percent: parseInt(columns[5].replace('%', '')), // Corregido: era columns[4]
          cleanable_gb: this.parseSize(columns[6])  // Corregido: era columns[5]
        };
        
        console.log(`📊 Resultado parseado:`, result);
        return result;
      } else {
        console.log(`⚠️ Número insuficiente de columnas: ${columns.length} (se esperaban al menos 7)`);
        console.log(`📝 Línea completa: "${line}"`);
      }
    }
  }
  
  throw new Error('No se encontró la línea "/data: post-comp" en la salida de df -h');
}

  // Convertir tamaños a números (asumiendo que ya están en GB)
  parseSize(sizeStr) {
    // Si el tamaño viene como "160508.5" ya está en GB
    const size = parseFloat(sizeStr);
    return isNaN(size) ? 0 : size;
  }
}

// ¡Esta línea también debe estar!
module.exports = SSHService;