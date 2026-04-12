const fs = require('fs')
const path = require('path')

const nextDir = path.join(process.cwd(), '.next')

try {
  if (fs.existsSync(nextDir)) {
    fs.rmSync(nextDir, { recursive: true, force: true })
    console.log('Removed .next cache before dev start.')
  }
} catch (error) {
  console.error('Failed to clean .next before dev start:', error)
  process.exit(1)
}
