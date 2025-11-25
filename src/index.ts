import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { uiComponent } from './ui'

// Importar NPCSpawner
import { NPCSpawner } from './npcSpawner'
// Importar helpers
import { setupCinematicCamera, createWorkStations, createStorageStations, createDiscardStation, setNPCSpawnerInstance, createConfettiItems } from './helpers'
import { NPC_SPAWN_INTERVAL, NPC_SPEED } from './constants'

export function main() {
  // Configurar la cámara cinematográfica
  setupCinematicCamera()

  // Configurar el renderer de UI
  ReactEcsRenderer.setUiRenderer(uiComponent)

  createWorkStations()
  createStorageStations()
  createDiscardStation()
  
  // Crear los confetti en cada spot
  createConfettiItems()

  // Crear el spawner de NPCs
  const npcSpawner = new NPCSpawner(
    NPC_SPAWN_INTERVAL, // spawnInterval en milisegundos
    NPC_SPEED   // speed en metros por segundo
  )

  // Establecer la referencia del spawner en helpers para poder resetear el juego
  setNPCSpawnerInstance(npcSpawner)
}
