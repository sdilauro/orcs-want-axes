import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { uiComponent } from './ui'

// Importar NPCSpawner
import { NPCSpawner } from './npcSpawner'
// Importar helpers
import { setupCinematicCamera, createWorkStations } from './helpers'

export function main() {
  // Configurar la cámara cinematográfica
  setupCinematicCamera()

  // Configurar el renderer de UI
  ReactEcsRenderer.setUiRenderer(uiComponent)

  createWorkStations()


  // Crear el spawner de NPCs
  new NPCSpawner(
    2000, // spawnInterval en milisegundos
    1.2   // speed en metros por segundo
  )

  
}
