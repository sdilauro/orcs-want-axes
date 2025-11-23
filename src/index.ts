import { Vector3 } from '@dcl/sdk/math'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { uiComponent } from './ui'

// Importar NPCSpawner
import { NPCSpawner } from './npcSpawner'
// Importar helpers
import { setupCinematicCamera, createWorkStations, createStorageStations, showUIMessage } from './helpers'

export function main() {
  // Configurar la cámara cinematográfica
  setupCinematicCamera()

  // Configurar el renderer de UI
  ReactEcsRenderer.setUiRenderer(uiComponent)

  // Crear las 3 WorkStations
  createWorkStations()

  // Crear las 3 StorageStations
  createStorageStations()

  // Crear el spawner de NPCs
  new NPCSpawner(
    2000, // spawnInterval en milisegundos
    1.2   // speed en metros por segundo
  )

  
}
