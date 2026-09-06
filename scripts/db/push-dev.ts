import { execSync } from 'child_process'

execSync('prisma migrate dev', { stdio: 'inherit' })
execSync('prisma generate', { stdio: 'inherit' })
