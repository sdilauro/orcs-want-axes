import { Vector3, Quaternion } from '@dcl/sdk/math'
import { engine, Transform, VirtualCamera, MainCamera, TriggerArea, triggerAreaEventsSystem, Schemas, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, AvatarAttach, AvatarAnchorPointType, Entity, AvatarShape, Animator, AudioSource, VisibilityComponent } from '@dcl/sdk/ecs'
import { CraftingStation } from './craftingStation'
import { ProcessingStation } from './processingStation'
import { setMessage, getMessage, clearMessage, setGameOverState, resetCounters, hidePlayAgainButton, isGameOverActive } from './ui'
import { ItemType, MESSAGE_DURATION, WORK_DURATION, CONFETTI_ROTATIONS, NPC_SPOTS } from './constants'

// Function to set up the cinematic camera
export function setupCinematicCamera() {
  // Create entity for the cinematic camera
  const cinematicCamera = engine.addEntity()

  // Position the camera at the scene boundary (8, 20, 0) and point to the center
  // For a 16x16 scene, the center is at (8, 0, 8)
  const cameraPosition = Vector3.create(8, 4, 2) // South boundary of the scene, 20m up
  const targetPoint = Vector3.create(8, 1.5, 8) // Center of the scene
  
  // Calculate direction from camera to center
  const direction = Vector3.subtract(targetPoint, cameraPosition)
  const normalizedDirection = Vector3.normalize(direction)
  
  // Use lookRotation to point towards the center of the scene
  Transform.create(cinematicCamera, {
    position: cameraPosition,
    rotation: Quaternion.lookRotation(normalizedDirection)
  })

  // Configure the virtual cinematic camera
  VirtualCamera.create(cinematicCamera, {
    defaultTransition: {
      transitionMode: VirtualCamera.Transition.Speed(5.0)
    }
  })

  // Activate the virtual camera immediately
  MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cinematicCamera

  // Create a trigger zone that covers the entire scene to keep the camera active
  const cameraTriggerArea = engine.addEntity()
  Transform.create(cameraTriggerArea, {
    position: Vector3.create(8, 0, 8), // Center of the scene
    scale: Vector3.create(16, 20, 16) // Covers the entire scene (16x16) and sufficient height
  })
  
  // Create the trigger area (box)
  TriggerArea.setBox(cameraTriggerArea)

  // When the player enters the area, activate the cinematic camera
  triggerAreaEventsSystem.onTriggerEnter(cameraTriggerArea, () => {
    MainCamera.getMutable(engine.CameraEntity).virtualCameraEntity = cinematicCamera
  })

  // Keep the camera active while the player is in the area
  triggerAreaEventsSystem.onTriggerStay(cameraTriggerArea, () => {
    const mainCamera = MainCamera.getMutable(engine.CameraEntity)
    if (mainCamera.virtualCameraEntity !== cinematicCamera) {
      mainCamera.virtualCameraEntity = cinematicCamera
    }
  })

  // The camera is configured as static and will not follow the character
  // Position and rotation are fixed, creating a topdown cinematic view
}

// Variable para el temporizador del mensaje
let messageTimer: number = 0

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
    // Silence errors to not stop execution
    console.error('Error in messageTimerSystem:', error)
    clearMessage()
    messageTimer = 0
  }
}, 0, 'messageTimerSystem')

// Function to show a message in the bottom UI of the screen
export function showUIMessage(message: string) {
  setMessage(message)
  messageTimer = 0
}

// Function to clear the UI message
export function clearUIMessage() {
  clearMessage()
  messageTimer = 0
}

// Function to create work stations
export function createWorkStations() {
  // ProcessingStation 1: Cauldron
  // Requires Herb, returns Cup to the floor
  const cauldron = new ProcessingStation(
    {
      position: Vector3.create(3, 0, 12), // Cauldron position
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1.25, 1.25, 1.25)
    },
    'assets/asset-packs/potion_cauldron/Cauldron_01/Cauldron_01.glb', // modelPath - cauldron
    WORK_DURATION, // workDuration
    'assets/asset-packs/wooden_cup/Cup_01/Cup_01.glb', // modelPathResult
    ItemType.HERB, // neededItemId
    Vector3.create(4, 0, 11), // resultPosition - position where the resulting item is created
    showUIMessage
  )
  processingStations.push(cauldron)

  // ProcessingStation 2: Stove
  // Requires Ore, returns Iron to the floor
  const stove = new ProcessingStation(
    {
      position: Vector3.create(13, 0, 12),
      rotation: Quaternion.fromEulerDegrees(0, 240, 0),
      scale: Vector3.create(1.5, 1.5, 1.5)
    },
    'assets/asset-packs/salamander_stove/Stove_01/Stove_01.glb', // modelPath
    WORK_DURATION, // workDuration
    'assets/asset-packs/gold_bar/GoldBar_01/GoldBar_01.glb', // modelPathResult
    ItemType.ORE, // neededItemId
    Vector3.create(12, 0, 11), // resultPosition - position where the resulting item is created
    showUIMessage
  )
  processingStations.push(stove)

  // CraftingStation 1: Anvil
  // Requires Iron, removes Iron and attaches Axe
  const anvil = new CraftingStation(
    {
      position: Vector3.create(10, 0, 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/anvil/Anvil_01/Anvil_01.glb', // modelPath
    WORK_DURATION, // workDuration
    ItemType.AXE, // resultType
    ItemType.IRON, // neededItemId
    {
      position: Vector3.create(10, 1, 10), // triggerArea position
      scale: Vector3.create(2, 2, 2) // triggerArea scale
    },
    showUIMessage
  )
  craftingStations.push(anvil)

  // CraftingStation 2: Potion Table
  // Requires Cup, removes Cup and attaches Potion
  const potionTable = new CraftingStation(
    {
      position: Vector3.create(6, 0, 10),
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1,1, 1)
    },
    'assets/asset-packs/druid_wooden_round_table/WoodRoundTable_01/WoodRoundTable_01.glb', // modelPath
    WORK_DURATION, // workDuration
    ItemType.POTION, // resultType
    ItemType.CUP, // neededItemId
    {
      position: Vector3.create(6, 1, 10), // triggerArea position
      scale: Vector3.create(2.5, 2.5, 2.5) // triggerArea scale
    },
    showUIMessage
  )
  craftingStations.push(potionTable)
}

// Function to create confetti entities at each NPC spot
export function createConfettiItems() {
  // Use spot positions from constants
  for (let i = 0; i < NPC_SPOTS.length; i++) {
    const spotPos = NPC_SPOTS[i].position
    const confettiEntity = engine.addEntity()
    
    // Position the confetti at the spot, slightly above
    Transform.create(confettiEntity, {
      position: Vector3.create(spotPos.x, 1.5, spotPos.z),
      rotation: Quaternion.fromEulerDegrees(0, CONFETTI_ROTATIONS[i], 0),
      scale: Vector3.create(0.5, 0.5, 0.5)
    })
    
    // Load the confetti model
    GltfContainer.create(confettiEntity, {
      src: 'assets/asset-packs/confetti/confetti.glb',
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 0
    })
    
    // Add animator with the "Animation" animation
    Animator.create(confettiEntity, {
      states: [
        {
          clip: 'Animation',
          playing: false,
          loop: false,
          speed: 1.0,
          weight: 1.0,
          shouldReset: false
        }
      ]
    })
    
    // Add audio source
    AudioSource.create(confettiEntity, {
      audioClipUrl: 'assets/asset-packs/confetti/fireworkexplode.mp3',
      playing: false,
      loop: false,
      volume: 1.0
    })
    
    // Initially hidden
    VisibilityComponent.create(confettiEntity, {
      visible: false
    })
    
    confettiEntities.push(confettiEntity)
  }
}

// Function to activate confetti at a specific spot
export function activateConfettiAtSpot(spotId: number) {
  if (spotId >= 0 && spotId < confettiEntities.length) {
    const confettiEntity = confettiEntities[spotId]
    
    // Show the confetti
    if (VisibilityComponent.has(confettiEntity)) {
      VisibilityComponent.getMutable(confettiEntity).visible = true
    }
    
    // Play animation
    if (Animator.has(confettiEntity)) {
      const animator = Animator.getMutable(confettiEntity)
      if (animator.states.length > 0) {
        animator.states[0].playing = true
      }
    }
    
    // Play sound - stop first and then start to ensure playback
    if (AudioSource.has(confettiEntity)) {
      const audioSource = AudioSource.getMutable(confettiEntity)
      audioSource.playing = false // Stop first
      // Use createOrReplace to restart the audio
      AudioSource.createOrReplace(confettiEntity, {
        audioClipUrl: 'assets/asset-packs/confetti/fireworkexplode.mp3',
        playing: true,
        loop: false,
        volume: 1.0
      })
    } else {
      // If it doesn't exist, create it
      AudioSource.create(confettiEntity, {
        audioClipUrl: 'assets/asset-packs/confetti/fireworkexplode.mp3',
        playing: true,
        loop: false,
        volume: 1.0
      })
    }
    
    // Register activation time to hide after 10 seconds
    confettiActivationTime.set(confettiEntity, Date.now())
  }
}

// System to hide confetti after 3 seconds
engine.addSystem((dt: number) => {
  const currentTime = Date.now()
  const confettiToHide: Entity[] = []
  
  for (const [entity, activationTime] of confettiActivationTime.entries()) {
    const elapsed = currentTime - activationTime
    if (elapsed >= 3000) { // 3 seconds
      // Hide the confetti
      if (VisibilityComponent.has(entity)) {
        VisibilityComponent.getMutable(entity).visible = false
      }
      if (Animator.has(entity)) {
        const animator = Animator.getMutable(entity)
        if (animator.states.length > 0) {
          animator.states[0].playing = false
        }
      }
      confettiToHide.push(entity)
    }
  }
  
  // Clean up the map
  for (const entity of confettiToHide) {
    confettiActivationTime.delete(entity)
  }
}, 0, 'confettiHideSystem')

// Function to create StorageStations (now using CraftingStation)
export function createStorageStations() {
  // StorageStation next to the cauldron - delivers Herb (wooden chest)
  const herbStorage = new CraftingStation(
    {
      position: Vector3.create(2.5, 0, 11), // To the left of the bucket (bucket is at 5, 0, 10)
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/cardamon_spicebag/Spicesbag_01/Spicesbag_01.glb',
    0.0, // workDuration = 0 (immediate)
    ItemType.HERB, // resultType
    '', // neededItemId empty (no item required)
    {
      position: Vector3.create(2.5, 1, 11), // triggerArea position (small, only for compatibility)
      scale: Vector3.create(0.1, 0.1, 0.1) // triggerArea minimum scale
    },
    showUIMessage
  )
  craftingStations.push(herbStorage)

  // StorageStation next to the stove - delivers Ore
  const oreStorage = new CraftingStation(
    {
      position: Vector3.create(13, 0, 11), // To the left of the stove (stove is at 13, 0, 12)
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    },
    'assets/asset-packs/mines_cart_coal/Mines Cart Coal.glb',
    0.0, // workDuration = 0 (immediate)
    ItemType.ORE, // resultType
    '', // neededItemId empty (no item required)
    {
      position: Vector3.create(13, 1, 11), // triggerArea position (small, only for compatibility)
      scale: Vector3.create(0.1, 0.1, 0.1) // triggerArea minimum scale
    },
    showUIMessage
  )
  craftingStations.push(oreStorage)
}

// Component to identify attached materials - Defined outside main() to avoid "Engine sealed" errors
const MaterialSchema = {
  id: Schemas.String
}
export const Material = engine.defineComponent('Material', MaterialSchema)

// ItemType is now in constants.ts

// Helper function to get all NPC avatar IDs (NPCs have empty name)
export function getNPCAvatarIds(): Set<string> {
  const npcAvatarIds = new Set<string>()
  try {
    for (const [entity, avatarShape] of engine.getEntitiesWith(AvatarShape)) {
      // NPCs have empty name, the player has a name
      if (avatarShape.name === '') {
        npcAvatarIds.add(avatarShape.id)
      }
    }
  } catch (error) {
    console.error('Error in getNPCAvatarIds:', error)
  }
  return npcAvatarIds
}

// Helper function to check if the player has any item in right hand
// Returns both a boolean and the entity/itemId (if found) for flexibility
export function hasItemInRightHand(): { hasItem: boolean, itemEntity?: Entity, itemId?: string } {
  try {
    const npcAvatarIds = getNPCAvatarIds()
    
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        // Only consider player items, not NPCs
        if (!avatarAttach.avatarId || !npcAvatarIds.has(avatarAttach.avatarId)) {
          if (Material.has(entity)) {
            const item = Material.get(entity)
            return { hasItem: true, itemEntity: entity, itemId: item?.id }
          }
          return { hasItem: true, itemEntity: entity }
        }
      }
    }
  } catch (error) {
    console.error('Error in hasItemInRightHand:', error)
  }
  return { hasItem: false }
}

// Helper function to check if the player has a specific material attached
// Returns both a boolean and the entity (if found) for flexibility
export function hasMaterialAttached(materialId: string): { hasItem: boolean, itemEntity?: Entity } {
  try {
    const npcAvatarIds = getNPCAvatarIds()
    
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        // Only consider player items, not NPCs
        if (!avatarAttach.avatarId || !npcAvatarIds.has(avatarAttach.avatarId)) {
          if (Material.has(entity)) {
            const item = Material.get(entity)
            if (item && item.id === materialId) {
              return { hasItem: true, itemEntity: entity }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in hasMaterialAttached:', error)
  }
  return { hasItem: false }
}

// Function to remove the item attached to the player's right hand
// Returns true if an item was removed, false otherwise
export function removeRightHandItem(): boolean {
  try {
    const npcAvatarIds = getNPCAvatarIds()
    
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        // Only remove if NOT attached to an NPC (i.e., it's the player's)
        if (!avatarAttach.avatarId || !npcAvatarIds.has(avatarAttach.avatarId)) {
          engine.removeEntity(entity)
          return true
        }
      }
    }
  } catch (error) {
    console.error('Error in removeRightHandItem:', error)
  }
  return false
}

// Function to create the item discard entity
export function createDiscardStation() {
  const discardEntity = engine.addEntity()
  
  // Position the entity at the center of the parcel
  Transform.create(discardEntity, {
    position: Vector3.create(2.5, 0, 8), // Center of the parcel (16x16)
    rotation: Quaternion.fromEulerDegrees(0, 0, 0),
    scale: Vector3.create(1, 1, 1)
  })
  
  // Load the bucket model
  GltfContainer.create(discardEntity, {
    src: 'assets/asset-packs/bucket/Bucket.glb'
  })
  
  // Add collider for interaction
  MeshCollider.setBox(discardEntity, ColliderLayer.CL_POINTER)
  
  // Configure interaction
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
      // Check if the game is in game over state
      if (isGameOverActive()) {
        return
      }
      
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
    // Check if the player already has something in the right hand
    const itemInfo = hasItemInRightHand()
    
    if (itemInfo.hasItem) {
      console.warn(`Cannot spawn ${itemType}: player already has an item in right hand`)
      showUIMessage('You already have something in your right hand')
      return
    }
    
    // Attach directly to the player's right hand
    // (the ingredient was already removed in handleInteraction)

    
    // Determine rotation: rotate 180 degrees on X for Axe and Potion
    let rotation = Quaternion.fromEulerDegrees(0, 0, 0)
    if (itemType === ItemType.AXE || itemType === ItemType.POTION) {
      rotation = Quaternion.fromEulerDegrees(180, 0, 0)
    }
    
    // Get the correct scale according to the item type
    const scale = getItemScaleFromType(itemType)
    
    // Create new entity for the result
    const resultEntity = engine.addEntity()
    
    Transform.create(resultEntity, {
      position: Vector3.create(0, 0, 0),
      rotation: rotation,
      scale: scale
    })
    
    // Load the model
    GltfContainer.create(resultEntity, {
      src: getModelPathFromType(itemType),
      visibleMeshesCollisionMask: 0, // No visible collisions
      invisibleMeshesCollisionMask: 0 // No invisible collisions
    })
    
    // Add Material component with the correct type
    Material.create(resultEntity, {
      id: itemType
    })
    
    // Attach to the player's right hand
    AvatarAttach.create(resultEntity, {
      anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
    })
}
  
// Helper function to determine ItemType based on modelPath
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
  // By default, try to extract from the filename
  return 'assets/asset-packs/wooden_cup/Cup_01/Cup_01.glb' // fallback
}

// Helper function to get the scale according to the item type
export function getItemScaleFromType(type: ItemType): Vector3 {
  if (type === ItemType.HERB || type === ItemType.ORE) {
    return Vector3.create(0.25, 0.25, 0.25)
  }
  return Vector3.create(1, 1, 1)
}


// Helper function to determine ItemType based on modelPath
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
  // By default
  return ItemType.HERB // fallback
}

// Variable to store the reference to the gameFinished entity
let gameFinishedEntity: Entity | null = null

// Variable to store the reference to the NPCSpawner
let npcSpawnerInstance: any = null

// Arrays to store references to stations
let processingStations: ProcessingStation[] = []
let craftingStations: CraftingStation[] = []

// Array to store confetti entities at each spot
let confettiEntities: Entity[] = []

// Map to track the activation time of each confetti
const confettiActivationTime: Map<Entity, number> = new Map()

// Function to set the NPCSpawner reference
export function setNPCSpawnerInstance(spawner: any) {
  npcSpawnerInstance = spawner
}

// Function to remove all items (from the floor and attached to the player)
function removeAllItems() {
  try {
    // Get all NPCs to exclude their items
    const npcAvatarIds = getNPCAvatarIds()
    
    const itemsToRemove: Entity[] = []
    
    // Find all items with Material component
    for (const [entity, material] of engine.getEntitiesWith(Material)) {
      // Check if it's attached to an NPC
      let isNPCItem = false
      
      if (AvatarAttach.has(entity)) {
        const avatarAttach = AvatarAttach.get(entity)
        // If it has avatarId and it's from an NPC, don't remove it (it's the NPC's item)
        if (avatarAttach.avatarId && npcAvatarIds.has(avatarAttach.avatarId)) {
          isNPCItem = true
        }
      }
      
      // If it's NOT an NPC item, add it to the list to remove (includes player items and floor items)
      if (!isNPCItem) {
        itemsToRemove.push(entity)
      }
    }
    
    // Remove all found items
    for (const itemEntity of itemsToRemove) {
      try {
        engine.removeEntity(itemEntity)
      } catch (error) {
        console.error('Error removing item:', error)
      }
    }
  } catch (error) {
    console.error('Error in removeAllItems:', error)
  }
}

// Function to reset all stations
function resetAllStations() {
  // Reset ProcessingStations
  for (const station of processingStations) {
    if (station && typeof station.reset === 'function') {
      station.reset()
    }
  }
  
  // Reset CraftingStations
  for (const station of craftingStations) {
    if (station && typeof station.reset === 'function') {
      station.reset()
    }
  }
  
}

// Function to show game finished (game over or you win)
export function gameFinished(winner: boolean) {
  // Hide UI messages
  clearUIMessage()
  
  // Stop NPC spawning
  if (npcSpawnerInstance && typeof npcSpawnerInstance.stopSpawning === 'function') {
    npcSpawnerInstance.stopSpawning()
  }
  
  // Remove all NPCs immediately
  if (npcSpawnerInstance && typeof npcSpawnerInstance.removeAllNPCs === 'function') {
    npcSpawnerInstance.removeAllNPCs()
  } else {
    // Fallback: remove NPCs manually
    removeAllNPCs()
  }
  
  // Remove all items (from the floor and attached to the player)
  removeAllItems()
  
  // Reset all stations
  resetAllStations()
  
  // Create entity for game finished
  gameFinishedEntity = engine.addEntity()
  
  // Configure transform with position (8, 2, 10) and scale (2, 2, 1)
  Transform.create(gameFinishedEntity, {
    position: Vector3.create(8, 1, 10),
    rotation: Quaternion.fromEulerDegrees(22.5, 0, 0),
    scale: Vector3.create(1.5, 1.5, 1)
  })
  
  // Load the model according to whether they won or lost
  const modelPath = winner 
    ? 'assets/asset-packs/you_win/win3.glb'
    : 'assets/asset-packs/game_over/gameover2.glb'
  
  // Sound path according to whether they won or lost
  const soundPath = winner
    ? 'assets/asset-packs/you_win/wingame.mp3'
    : 'assets/asset-packs/game_over/gameover.mp3'
  
  GltfContainer.create(gameFinishedEntity, {
    src: modelPath
  })
  
  // Add animator to play the "Play" animation of the model
  Animator.create(gameFinishedEntity, {
    states: [
      {
        clip: 'Play',
        playing: true,
        loop: false,
        speed: 1.0,
        weight: 1.0,
        shouldReset: false
      }
    ]
  })
  
  // Add AudioSource to play the sound
  AudioSource.create(gameFinishedEntity, {
    audioClipUrl: soundPath,
    playing: true,
    loop: false,
    volume: 1.0
  })
  
  // Set the game over state in the UI
  setGameOverState(true)
  
  // More effects can be added here in the future
}

// Function to reset the game
export function resetGame() {
  // Reset counters
  resetCounters()
  
  // Remove the game finished entity
  if (gameFinishedEntity !== null) {
    try {
      engine.removeEntity(gameFinishedEntity)
    } catch (error) {
      console.error('Error removing gameFinishedEntity:', error)
    }
    gameFinishedEntity = null
  }
  
  // Hide the Play Again button and reset the game over state
  hidePlayAgainButton()
  setGameOverState(false)
  
  // Restart NPC spawning (this will also remove existing NPCs and reset the state)
  if (npcSpawnerInstance && typeof npcSpawnerInstance.restartSpawning === 'function') {
    npcSpawnerInstance.restartSpawning()
  } else {
    // Fallback: remove NPCs manually
    removeAllNPCs()
  }
  
  // Clear UI message
  clearUIMessage()
}

// Helper function to remove all NPCs (NPCs have empty name in AvatarShape)
function removeAllNPCs() {
  try {
    const npcsToRemove: Entity[] = []
    
    // Find all NPCs (they have empty name)
    for (const [entity, avatarShape] of engine.getEntitiesWith(AvatarShape)) {
      if (avatarShape.name === '') {
        npcsToRemove.push(entity)
      }
    }
    
    // Remove all found NPCs
    for (const npcEntity of npcsToRemove) {
      try {
        engine.removeEntity(npcEntity)
      } catch (error) {
        console.error('Error removing NPC:', error)
      }
    }
  } catch (error) {
    console.error('Error in removeAllNPCs:', error)
  }
}