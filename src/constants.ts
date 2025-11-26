import { Vector3 } from '@dcl/sdk/math'

// Game constants
export const DELIVERED_TO_WIN = 5
export const DELIVERED_TO_LOSE = 5

// UI constants
export const MESSAGE_DURATION = 1.0 // seconds

// NPC constants
export const NPC_SPAWN_INTERVAL = 2000 // milliseconds between each NPC
export const NPC_SPEED = 1.2 // meters per second
export const NPC_WAIT_TIME = 20.0 // base seconds the NPC waits at the spot before leaving
export const NPC_WAIT_TIME_VARIATION = 2.0 // random variation in seconds (±) added to NPC_WAIT_TIME so they don't all wait the same time
export const arrivalEmotes = ['wave', 'raiseHand', 'handsup']
export const goodbyeEmotes = ['clap', 'dontsee']

// Spot positions where NPCs stop
export const NPC_SPOTS: { id: number, position: Vector3 }[] = [
  { id: 0, position: Vector3.create(9.75, 0, 15) },
  { id: 1, position: Vector3.create(8.1, 0, 15) },
  { id: 2, position: Vector3.create(6.5, 0, 15) }
]

// NPC origin positions
export const NPC_ORIGIN_EAST = Vector3.create(14, 0, 18)
export const NPC_ORIGIN_WEST = Vector3.create(2, 0, 18)

// Confetti rotations for each spot
export const CONFETTI_ROTATIONS = [-45, -90, -135]

// Work station constants
export const WORK_DURATION = 2.0 // seconds to process/craft

// Enum for item types
export enum ItemType {
  HERB = 'herb',
  CUP = 'cup',
  ORE = 'ore',
  IRON = 'iron',
  AXE = 'axe',
  POTION = 'potion'
}

