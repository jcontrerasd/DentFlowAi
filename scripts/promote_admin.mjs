import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../frontend/.env.local') });

const sql = postgres(process.env.DATABASE_URL);

async function setAdmin() {
  const email = 'jaime.contreras.d@gmail.com';
  const rawPass = 'Admin2026!';
  
  console.log(`🚀 Seteando Admin y Password para: ${email}...`);
  
  try {
    const hashedPassword = await bcrypt.hash(rawPass, 10);
    
    const result = await sql`
      UPDATE "user" 
      SET role = 'admin', 
          is_active = true, 
          hashed_password = ${hashedPassword}
      WHERE email = ${email}
      RETURNING id, role;
    `;
    
    if (result.length > 0) {
      console.log('✅ ¡TODO LISTO! Ya puedes loguearte.');
      console.log(`Email: ${email}`);
      console.log(`Password: ${rawPass}`);
    } else {
      console.log('❌ ERROR: El usuario no existe en la DB. Regístrate primero en la web.');
    }
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await sql.end();
  }
}

setAdmin();
