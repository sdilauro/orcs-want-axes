import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, MeshRenderer, Material as MaterialECS, Billboard, BillboardMode, AvatarShape } from '@dcl/sdk/ecs'
import { Material, getItemTypeFromModelPath, hasMaterialAttached, removeRightHandItem, hasItemInRightHand } from './helpers'
import { ItemType } from './constants'
import { isGameOverActive } from './ui'

// Tipo para los datos de Transform
type TransformData = {
  position: Vector3
  rotation?: Quaternion
  scale?: Vector3
  parent?: Entity
}

// Component to store the station state
const ProcessingStationSchema = {
  isWorking: Schemas.Boolean,
  workDuration: Schemas.Number, // Work duration in seconds
  workProgress: Schemas.Number, // Work progress (0 to 1)
  resultModel: Schemas.String, // Resulting model path
  neededItemId: Schemas.String // Required item ID
}
const ProcessingStationComponent = engine.defineComponent('ProcessingStation', ProcessingStationSchema)



export class ProcessingStation {
  private entity: Entity
  private spinnerEntity!: Entity
  private workSystemName: string
  private showMessage?: (message: string) => void
  private resultPosition: Vector3

  constructor(
    transform: TransformData,
    modelPath: string,
    workDuration: number,
    modelPathResult: string,
    neededItemId: string,
    resultPosition: Vector3,
    showMessage?: (message: string) => void
  ) {
    // Create the entity
    this.entity = engine.addEntity()
    
    // Apply transform
    Transform.create(this.entity, {
      position: transform.position,
      rotation: transform.rotation || Quaternion.fromEulerDegrees(0, 0, 0),
      scale: transform.scale || Vector3.create(1, 1, 1),
      parent: transform.parent
    })
    
    // Load the model
    GltfContainer.create(this.entity, {
      src: modelPath,
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER | ColliderLayer.CL_PHYSICS, // CL_SCENE does not exist, using CL_PHYSICS as likely intended
      invisibleMeshesCollisionMask: 3
    })
    
    // Add collider for interaction
    MeshCollider.setBox(this.entity, ColliderLayer.CL_POINTER)
    
    // Create station component
    ProcessingStationComponent.create(this.entity, {
      isWorking: false,
      workDuration: workDuration,
      workProgress: 0,
      resultModel: modelPathResult,
      neededItemId: neededItemId
    })
    
    // Create unique name for the system
    this.workSystemName = `processingStation-${this.entity}`
    this.showMessage = showMessage
    this.resultPosition = resultPosition
    
    // Configure interaction
    this.setupInteraction()
    
    // Don't start the work system until needed
  }

  private setupInteraction() {
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Start processing',
          maxDistance: 2
        }
      },
      () => {
        this.handleInteraction()
      }
    )
  }

  private handleInteraction() {
    // Check if the game is in game over state
    if (isGameOverActive()) {
      return
    }
    
    const station = ProcessingStationComponent.get(this.entity)
    
    // Check if it's already working
    if (station.isWorking) {
      if (this.showMessage) {
        this.showMessage('Station is already processing!')
      }
      return
    }
    
    // Check if the player has the required item
    const itemInfo = hasMaterialAttached(station.neededItemId)
    if (!itemInfo.hasItem || !itemInfo.itemEntity) {
      if (this.showMessage) {
        this.showMessage(`You need ${station.neededItemId} in your right hand`)
      }
      return
    }
    
    // Start work
    ProcessingStationComponent.getMutable(this.entity).isWorking = true
    ProcessingStationComponent.getMutable(this.entity).workProgress = 0
    
    // Remove the item from the player
    removeRightHandItem()
    
    // Show spinner
    this.showSpinner()
    
    // Start work system only when needed
    this.startWorkSystem()
    
    if (this.showMessage) {
      this.showMessage('Processing started!')
    }
  }

  private showSpinner() {
    // Create spinner entity as child of the station
    this.spinnerEntity = engine.addEntity()
    
    const stationTransform = Transform.get(this.entity)
    const stationScale = stationTransform.scale || Vector3.create(1, 1, 1)
    const inverseScale = Vector3.create(
      1 / stationScale.x,
      1 / stationScale.y,
      1 / stationScale.z
    )
    
    // Initialize with Y scale = 1 (will decrease as progress advances)
    Transform.create(this.spinnerEntity, {
      position: Vector3.create(0, 3, 0), // 3 meters above the station
      scale: Vector3.create(inverseScale.x, inverseScale.y, inverseScale.z), // Initial Y scale = 1
      parent: this.entity
    })
    
    // Create a circle/plane as spinner
    MeshRenderer.setPlane(this.spinnerEntity)
    MaterialECS.setPbrMaterial(this.spinnerEntity, {
      albedoColor: Color4.create(1, 1, 0, 0.8), // Semi-transparent yellow
      emissiveColor: Color4.create(1, 1, 0, 0.5) // Yellow glow
    })
    
    // Make the spinner always face the camera
    Billboard.create(this.spinnerEntity, {
      billboardMode: BillboardMode.BM_Y
    })
    
    // Rotate the spinner continuously
    const rotationSpeed = 360 // degrees per second
    let currentYRotation = 0
    engine.addSystem((dt: number) => {
      if (!Transform.has(this.spinnerEntity)) {
        return
      }
      currentYRotation += rotationSpeed * dt
      if (currentYRotation >= 360) {
        currentYRotation -= 360
      }
      const newRotation = Quaternion.fromEulerDegrees(0, currentYRotation, 0)
      Transform.getMutable(this.spinnerEntity).rotation = newRotation
    }, 0, `spinnerRotation-${this.entity}`)
  }

  private hideSpinner() {
    if (this.spinnerEntity && Transform.has(this.spinnerEntity)) {
      engine.removeEntity(this.spinnerEntity)
    }
    engine.removeSystem(`spinnerRotation-${this.entity}`)
  }

  private startWorkSystem() {
    // Check if the system already exists to avoid duplicates
    try {
      engine.removeSystem(this.workSystemName)
    } catch (e) {
      // The system doesn't exist, that's fine
    }
    
    engine.addSystem((dt: number) => {
      if (!ProcessingStationComponent.has(this.entity)) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const station = ProcessingStationComponent.get(this.entity)
      
      // If not working, remove the system and exit
      if (!station.isWorking) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const mutableStation = ProcessingStationComponent.getMutable(this.entity)
      
      // Update progress
      mutableStation.workProgress += dt / mutableStation.workDuration
      
      // Update spinner Y scale based on progress (from 1 to 0)
      if (Transform.has(this.spinnerEntity)) {
        const spinnerTransform = Transform.getMutable(this.spinnerEntity)
        const stationTransform = Transform.get(this.entity)
        const stationScale = stationTransform.scale || Vector3.create(1, 1, 1)
        const inverseScale = Vector3.create(
          1 / stationScale.x,
          1 / stationScale.y,
          1 / stationScale.z
        )
        // Y scale goes from 1 to 0 as progress goes from 0 to 1
        const progressYScale = 1 - mutableStation.workProgress
        spinnerTransform.scale = Vector3.create(
          inverseScale.x,
          inverseScale.y * progressYScale,
          inverseScale.z
        )
      }
      
      // If work is complete
      if (mutableStation.workProgress >= 1.0) {
        mutableStation.isWorking = false
        mutableStation.workProgress = 0
        
        // Hide spinner
        this.hideSpinner()
        
        // Create the result on the floor
        this.spawnResultOnFloor(mutableStation.resultModel)
        
        // Remove the work system
        engine.removeSystem(this.workSystemName)
        
        if (this.showMessage) {
          this.showMessage('Processing completed!')
        }
      }
    }, 0, this.workSystemName)
  }

  private spawnResultOnFloor(modelPath: string) {
    // Create the result on the floor with random variation in position and rotation
    const resultEntity = engine.addEntity()
    
    // Random variation in X and Z of +/-0.2
    const randomX = (Math.random() - 0.5) * 0.4 // -0.2 to +0.2
    const randomZ = (Math.random() - 0.5) * 0.4 // -0.2 to +0.2
    const randomYRotation = Math.random() * 360 // 0 to 360 degrees
    
    // Position with random variation, Y always at 0
    const randomPosition = Vector3.create(
      this.resultPosition.x + randomX,
      0, // Y always at 0
      this.resultPosition.z + randomZ
    )
    
    Transform.create(resultEntity, {
      position: randomPosition,
      rotation: Quaternion.fromEulerDegrees(0, randomYRotation, 0),
      scale: Vector3.create(1, 1, 1)
    })
    
    // Load the model
    GltfContainer.create(resultEntity, {
      src: modelPath
    })
    
    // Add collider so it can be picked up
    MeshCollider.setBox(resultEntity, ColliderLayer.CL_POINTER)
    
    // Add Material component with the correct type
    const itemType = getItemTypeFromModelPath(modelPath)
    Material.create(resultEntity, {
      id: itemType
    })
    
    // Add interaction to attach to the right hand
    pointerEventsSystem.onPointerDown(
      {
        entity: resultEntity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Pick up',
          maxDistance: 2
        }
      },
      () => {
        this.handlePickupItem(resultEntity)
      }
    )
  }

  private handlePickupItem(itemEntity: Entity) {
    // Check if the player already has something in the right hand
    const itemInfo = hasItemInRightHand()
    
    if (itemInfo.hasItem) {
      if (this.showMessage) {
        this.showMessage('You already have something in your right hand')
      }
      return
    }
    
    // Get the transform of the entity before attaching it
    const itemTransform = Transform.get(itemEntity)
    const itemGltf = GltfContainer.get(itemEntity)
    
    // Get the item type from the Material component if it exists
    let itemType: string = ItemType.HERB // fallback
    if (Material.has(itemEntity)) {
      const material = Material.get(itemEntity)
      if (material) {
        itemType = material.id
      }
    } else {
      // If it doesn't have Material component, try to determine it by the model
      itemType = getItemTypeFromModelPath(itemGltf.src)
    }
    
    // Remove the entity from the world
    engine.removeEntity(itemEntity)
    
    // Create a new entity to attach
    const attachedEntity = engine.addEntity()
    
    // Copy the transform (scale and rotation)
    Transform.create(attachedEntity, {
      position: Vector3.create(0, 0, 0),
      rotation: itemTransform.rotation,
      scale: itemTransform.scale || Vector3.create(1, 1, 1)
    })
    
    // Load the same model
    GltfContainer.create(attachedEntity, {
      src: itemGltf.src,
      visibleMeshesCollisionMask: 0, // No visible collisions
      invisibleMeshesCollisionMask: 0 // No invisible collisions
    })
    
    // Add Material component with the correct type
    Material.create(attachedEntity, {
      id: itemType
    })
    
    // Attach to the player's right hand
    AvatarAttach.create(attachedEntity, {
      anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
    })
    
    if (this.showMessage) {
      this.showMessage('Item picked up')
    }
  }

  // Method to destroy the station
  public destroy() {
    engine.removeSystem(this.workSystemName)
    engine.removeSystem(`spinnerRotation-${this.entity}`)
    this.hideSpinner()
    engine.removeEntity(this.entity)
  }

  // Method to reset the station
  public reset() {
    // Stop work if in progress
    if (ProcessingStationComponent.has(this.entity)) {
      const station = ProcessingStationComponent.getMutable(this.entity)
      station.isWorking = false
      station.workProgress = 0
    }
    
    // Hide spinner if it exists
    this.hideSpinner()
    
    // Remove work system
    try {
      engine.removeSystem(this.workSystemName)
    } catch (e) {
      // The system doesn't exist, that's fine
    }
  }
}

