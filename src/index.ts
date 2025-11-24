import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { uiComponent } from './ui'

// Importar NPCSpawner
import { NPCSpawner } from './npcSpawner'
// Importar helpers
import { setupCinematicCamera, createWorkStations, createStorageStations, createDiscardStation, setNPCSpawnerInstance } from './helpers'

export function main() {
  // Configurar la cámara cinematográfica
  setupCinematicCamera()

  // Configurar el renderer de UI
  ReactEcsRenderer.setUiRenderer(uiComponent)

  createWorkStations()
  createStorageStations()
  createDiscardStation()

  // Crear el spawner de NPCs
  const npcSpawner = new NPCSpawner(
    2000, // spawnInterval en milisegundos
    1.2   // speed en metros por segundo
  )

  // Establecer la referencia del spawner en helpers para poder resetear el juego
  setNPCSpawnerInstance(npcSpawner)
}
