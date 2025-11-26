import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { uiComponent } from './ui'

// Import NPCSpawner
import { NPCSpawner } from './npcSpawner'
// Import helpers
import { setupCinematicCamera, createWorkStations, createStorageStations, createDiscardStation, setNPCSpawnerInstance, createConfettiItems } from './helpers'
import { NPC_SPAWN_INTERVAL, NPC_SPEED } from './constants'

export function main() {
  // Set up the cinematic camera
  setupCinematicCamera()

  // Set up the UI renderer
  ReactEcsRenderer.setUiRenderer(uiComponent)

  createWorkStations()
  createStorageStations()
  createDiscardStation()
  
  // Create confetti at each spot
  createConfettiItems()

  // Create the NPC spawner
  const npcSpawner = new NPCSpawner(
    NPC_SPAWN_INTERVAL, // spawnInterval in milliseconds
    NPC_SPEED   // speed in meters per second
  )

  // Set the spawner reference in helpers to be able to reset the game
  setNPCSpawnerInstance(npcSpawner)
}
