import { execSync } from 'child_process'

execSync('prisma migrate dev --name auto', { stdio: ['ignore', 'inherit', 'inherit'] })
execSync('prisma generate', { stdio: ['ignore', 'inherit', 'inherit'] })
