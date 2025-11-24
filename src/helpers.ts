import { Vector3, Quaternion } from '@dcl/sdk/math'
import { engine, Transform, VirtualCamera, MainCamera, TriggerArea, triggerAreaEventsSystem, Schemas, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, AvatarAttach, AvatarAnchorPointType } from '@dcl/sdk/ecs'
import { CraftingStation } from './craftingStation'
import { ProcessingStation } from './processingStation'
import { StorageStation } from './storageStation'
import { setMessage, getMessage, clearMessage } from './ui'

// Función para configurar la cámara cinematográfica
export function setupCinematicCamera() {
  // Crear entidad para la cámara cinematográfica
  const cinematicCamera = engine.addEntity()

  // Posicionar la cámara en la frontera de la escena (8, 20, 0) y apuntar al centro
  // Para una escena de 16x16, el centro está en (8, 0, 8)
  const cameraPosition = Vector3.create(8, 4, 2) // Frontera sur de la escena, 20m arriba
  const targetPoint = Vector3.create(8, 1.5, 8) // Centro de la escena
  
  // Calcular dirección desde la cámara hacia el centro
  const direction = Vector3.subtract(targetPoint, cameraPosition)
  const normalizedDirection = Vector3.normalize(direction)
  
  // Usar lookRotation para apuntar hacia el centro de la escena
  Transform.create(cinematicCamera, {
    position: cameraPosition,
    rotation: Quaternion.lookRotation(normalizedDirection)
  })

  // Configurar la cámara virtual cinematográfica
  VirtualCamera.create(cinematicCamera, {
    defaultTransition: {
      transitionMode: VirtualCamera.Transition.Speed(5.0)
    }
  })

  // Activar la cámara virtual inmediatamente
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cinematicCamera

  // Crear una zona de trigger que cubre toda la escena para mantener la cámara activa
  const cameraTriggerArea = engine.addEntity()
  Transform.create(cameraTriggerArea, {
    position: Vector3.create(8, 0, 8), // Centro de la escena
    scale: Vector3.create(16, 20, 16) // Cubre toda la escena (16x16) y altura suficiente
  })
  
  // Crear el área de trigger (box)
  TriggerArea.setBox(cameraTriggerArea)

  // Cuando el jugador entra en el área, activar la cámara cinematográfica
  triggerAreaEventsSystem.onTriggerEnter(cameraTriggerArea, () => {
    MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cinematicCamera
  })

  // Mantener la cámara activa mientras el jugador está en el área
  triggerAreaEventsSystem.onTriggerStay(cameraTriggerArea, () => {
    const mainCamera = MainCamera.getMutable(engine.CameraEntity)
    if (mainCamera.virtualCameraEntity !== cinematicCamera) {
      mainCamera.virtualCameraEntity = cinematicCamera
    }
  })

  // La cámara está configurada como estática y no seguirá al personaje
  // La posición y rotación están fijas, creando una vista topdown cinematográfica
}

// Variable para el temporizador del mensaje
let messageTimer: number = 0
const MESSAGE_DURATION = 3.0 // segundos

// Sistema para manejar el temporizador del mensaje
engine.addSystem((dt: number) => {
  try {
    const currentMessage = getMessage()
    if (currentMessage !== '') {
      messageTimer += dt
      if (messageTimer >= MESSAGE_DURATION) {
        clearMessage()
        messageTimer = 0
      }
    }
  } catch (error) {
    // Silenciar errores para no detener la ejecución
    console.error('Error en messageTimerSystem:', error)
    clearMessage()
    messageTimer = 0
  }
}, 0, 'messageTimerSystem')

// Función para mostrar un mensaje en la UI inferior de la pantalla
export function showUIMessage(message: string) {
  setMessage(message)
  messageTimer = 0
}

// Función para limpiar el mensaje de la UI
export function clearUIMessage() {
  clearMessage()
  messageTimer = 0
}

// Función para crear las estaciones de trabajo
export function createWorkStations() {
  // ProcessingStation 1: Cauldron (Caldero)
  // Requiere Herb, devuelve Cup al piso
  new ProcessingStation(
    {
      position: Vector3.create(3, 0, 12), // Posición del caldero
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1.25, 1.25, 1.25)
    },
    'assets/asset-packs/potion_cauldron/Cauldron_01/Cauldron_01.glb', // modelPath - caldero
    5.0, // workDuration
    'assets/asset-packs/wooden_cup/Cup_01/Cup_01.glb', // modelPathResult
    ItemType.HERB, // neededItemId
    Vector3.create(4, 0, 11), // resultPosition - posición donde se crea el item resultante
    showUIMessage
  )

  // ProcessingStation 2: Stove
  // Requiere Ore, devuelve Iron al piso
  new ProcessingStation(
    {
      position: Vector3.create(13, 0, 12),
      rotation: Quaternion.fromEulerDegrees(0, 240, 0),
      scale: Vector3.create(1.5, 1.5, 1.5)
    },
    'assets/asset-packs/salamander_stove/Stove_01/Stove_01.glb', // modelPath
    5.0, // workDuration
    'assets/asset-packs/gold_bar/GoldBar_01/GoldBar_01.glb', // modelPathResult
    ItemType.ORE, // neededItemId
    Vector3.create(12, 0, 11), // resultPosition - posición donde se crea el item resultante
    showUIMessage
  )

  // CraftingStation 1: Anvil (Yunque)
  // Requiere Iron, elimina Iron y attachea Axe
  new CraftingStation(
    {
      position: Vector3.create(10, 0, 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/anvil/Anvil_01/Anvil_01.glb', // modelPath
    5.0, // workDuration
    ItemType.AXE, // resultType
    ItemType.IRON, // neededItemId
    {
      position: Vector3.create(10, 1, 10), // triggerArea position
      scale: Vector3.create(2, 2, 2) // triggerArea scale
    },
    showUIMessage
  )

  // CraftingStation 2: Potion Table (Mesa de Poción)
  // Requiere Cup, elimina Cup y attachea Potion
  new CraftingStation(
    {
      position: Vector3.create(6, 0, 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1,1, 1)
    },
    'assets/asset-packs/druid_wooden_round_table/WoodRoundTable_01/WoodRoundTable_01.glb', // modelPath
    5.0, // workDuration
    ItemType.POTION, // resultType
    ItemType.CUP, // neededItemId
    {
      position: Vector3.create(6, 1, 10), // triggerArea position
      scale: Vector3.create(2.5, 2.5, 2.5) // triggerArea scale
    },
    showUIMessage
  )
}

// Función para crear las StorageStations
export function createStorageStations() {
  // StorageStation al lado del caldero - entrega Herb (cofre de madera)
  new StorageStation(
    {
      position: Vector3.create(2.5, 0, 11), // Al lado izquierdo del bucket (bucket está en 5, 0, 10)
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/cardamon_spicebag/Spicesbag_01/Spicesbag_01.glb',
    ItemType.HERB,
    Vector3.create(2.5, 0, 10), // resultPosition - posición donde se crea el item resultante
    showUIMessage
  )

  // StorageStation al lado del stove - entrega Ore
  new StorageStation(
    {
      position: Vector3.create(13, 0, 11), // Al lado izquierdo del stove (stove está en 13, 0, 12)
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/mines_cart_coal/Mines Cart Coal.glb',
    ItemType.ORE,
    Vector3.create(13, 0, 10), // resultPosition - posición donde se crea el item resultante
    showUIMessage
  )
}

// Componente para identificar materiales attachados - Definido fuera de main() para evitar errores de "Engine sealed"
const MaterialSchema = {
  id: Schemas.String
}
export const Material = engine.defineComponent('Material', MaterialSchema)

// Enum para los tipos de items
export enum ItemType {
  HERB = 'herb',
  CUP = 'cup',
  ORE = 'ore',
  IRON = 'iron',
  AXE = 'axe',
  POTION = 'potion'
}

// Función para eliminar el item attachado a la mano derecha
function removeRightHandItem() {
  try {
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        engine.removeEntity(entity)
        return true
      }
    }
  } catch (error) {
    console.error('Error en removeRightHandItem:', error)
  }
  return false
}

// Función para crear la entidad de descarte de items
export function createDiscardStation() {
  const discardEntity = engine.addEntity()
  
  // Posicionar la entidad en el centro de la parcela
  Transform.create(discardEntity, {
    position: Vector3.create(2.5, 0, 8), // Centro de la parcela (16x16)
    rotation: Quaternion.fromEulerDegrees(0, 0, 0),
    scale: Vector3.create(1, 1, 1)
  })
  
  // Cargar el modelo de bucket
  GltfContainer.create(discardEntity, {
    src: 'assets/asset-packs/bucket/Bucket.glb'
  })
  
  // Agregar collider para interacción
  MeshCollider.setBox(discardEntity, ColliderLayer.CL_POINTER)
  
  // Configurar interacción
  pointerEventsSystem.onPointerDown(
    {
      entity: discardEntity,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'Discard item',
        maxDistance: 2
      }
    },
    () => {
      const removed = removeRightHandItem()
      if (removed) {
        showUIMessage('Item discarded')
      } else {
        showUIMessage('No item to discard')
      }
    }
  )
}


export function spawnResultItem(itemType: ItemType) {
    // Attachear directamente a la mano derecha del jugador
    // (el ingrediente ya fue removido en handleInteraction)

    
    // Determinar rotación: rotar 180 grados en X para Axe y Potion
    let rotation = Quaternion.fromEulerDegrees(0, 0, 0)
    if (itemType === ItemType.AXE || itemType === ItemType.POTION) {
      rotation = Quaternion.fromEulerDegrees(180, 0, 0)
    }
    
    // Crear nueva entidad para el resultado
    const resultEntity = engine.addEntity()
    
    Transform.create(resultEntity, {
      position: Vector3.create(0, 0, 0),
      rotation: rotation,
      scale: Vector3.create(1, 1, 1)
    })
    
    // Cargar el modelo
    GltfContainer.create(resultEntity, {
      src: getModelPathFromType(itemType),
      visibleMeshesCollisionMask: 0, // Sin colisiones visibles
      invisibleMeshesCollisionMask: 0 // Sin colisiones invisibles
    })
    
    // Agregar componente Material con el tipo correcto
    Material.create(resultEntity, {
      id: itemType
    })
    
    // Attachear a la mano derecha del jugador
    AvatarAttach.create(resultEntity, {
      anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
    })
}
  
// Función helper para determinar el ItemType basándose en el modelPath
export function getModelPathFromType(type: ItemType): string {
  if (type === ItemType.CUP) {
    return 'assets/asset-packs/wooden_cup/Cup_01/Cup_01.glb'
  } else if ( type === ItemType.IRON) {
    return 'assets/asset-packs/gold_bar/GoldBar_01/GoldBar_01.glb'
  } else if (type === ItemType.AXE) {
    return 'assets/asset-packs/wooden_axe/Axe_01/Axe_01.glb'
  } else if (type === ItemType.POTION) {
    return 'assets/asset-packs/green_potion/Potion_03/Potion_03.glb'
  } else if (type === ItemType.HERB) {
    return 'assets/asset-packs/plant_2/Plant 2.glb'
  } else if (type === ItemType.ORE) {
    return 'assets/asset-packs/sandy_rock/RockSand_01/RockSand_01.glb'
  }
  // Por defecto, intentar extraer del nombre del archivo
  return 'assets/asset-packs/wooden_cup/Cup_01/Cup_01.glb' // fallback
}

// Función helper para obtener la escala según el tipo de item
export function getItemScaleFromType(type: ItemType): Vector3 {
  if (type === ItemType.HERB || type === ItemType.ORE) {
    return Vector3.create(0.25, 0.25, 0.25)
  }
  return Vector3.create(1, 1, 1)
}

// Función helper para obtener modelo y escala según el tipo de item
export function getItemModelAndScale(type: ItemType): { modelPath: string, scale: Vector3 } {
  return {
    modelPath: getModelPathFromType(type),
    scale: getItemScaleFromType(type)
  }
}

// Función helper para determinar el ItemType basándose en el modelPath
export function getItemTypeFromModelPath(modelPath: string): ItemType {
  if (modelPath.includes('Cup_01') || modelPath.includes('cup')) {
    return ItemType.CUP
  } else if (modelPath.includes('GoldBar_01') || modelPath.includes('gold_bar')) {
    return ItemType.IRON
  } else if (modelPath.includes('Axe_01') || modelPath.includes('axe')) {
    return ItemType.AXE
  } else if (modelPath.includes('Potion_03') || modelPath.includes('Potion_02') || modelPath.includes('Potion_01') || modelPath.includes('potion')) {
    return ItemType.POTION
  } else if (modelPath.includes('herb') || modelPath.includes('Plant')) {
    return ItemType.HERB
  } else if (modelPath.includes('ore') || modelPath.includes('Rock')) {
    return ItemType.ORE
  }
  // Por defecto
  return ItemType.HERB // fallback
}

// Función para mostrar el game over
export function gameOver() {
  // Crear entidad para el game over
  const gameOverEntity = engine.addEntity()
  
  // Configurar transform con posición (8, 2, 10) y escala (2, 2, 1)
  Transform.create(gameOverEntity, {
    position: Vector3.create(8, 2, 10),
    rotation: Quaternion.fromEulerDegrees(0, 0, 0),
    scale: Vector3.create(2, 2, 1)
  })
  
  // Cargar el modelo de game over
  GltfContainer.create(gameOverEntity, {
    src: 'asset-packs/game_over/gameover2.glb'
  })
  
  // Aquí se pueden agregar más efectos en el futuro
}