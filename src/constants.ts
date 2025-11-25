import { Vector3 } from '@dcl/sdk/math'

// Constantes del juego
export const DELIVERED_TO_WIN = 5
export const DELIVERED_TO_LOSE = 5

// Constantes de UI
export const MESSAGE_DURATION = 1.0 // segundos

// Constantes de NPCs
export const NPC_SPAWN_INTERVAL = 2000 // milisegundos entre cada NPC
export const NPC_SPEED = 1.2 // metros por segundo
export const NPC_WAIT_TIME = 10.0 // segundos que espera el NPC en el spot antes de marcharse
export const NPC_WAIT_TIME_RANGE = 2.0 // variación del NPC_WAIT_TIME para que no todos esperen el mismo tiempo
export const arrivalEmotes = ['wave', 'raiseHand', 'handsup']
export const goodbyeEmotes = ['clap', 'dontsee']

// Posiciones de spots donde se paran los NPCs
export const NPC_SPOTS: { id: number, position: Vector3 }[] = [
  { id: 0, position: Vector3.create(9.75, 0, 15) },
  { id: 1, position: Vector3.create(8.1, 0, 15) },
  { id: 2, position: Vector3.create(6.5, 0, 15) }
]

// Posiciones de origen de los NPCs
export const NPC_ORIGIN_EAST = Vector3.create(14, 0, 18)
export const NPC_ORIGIN_WEST = Vector3.create(2, 0, 18)

// Rotaciones de confetti para cada spot
export const CONFETTI_ROTATIONS = [-45, -90, -135]

// Constantes de estaciones de trabajo
export const WORK_DURATION = 1.0 // segundos para procesar/craftear

// Enum para los tipos de items
export enum ItemType {
  HERB = 'herb',
  CUP = 'cup',
  ORE = 'ore',
  IRON = 'iron',
  AXE = 'axe',
  POTION = 'potion'
}

