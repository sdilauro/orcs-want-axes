import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, MeshRenderer, Material as MaterialECS, Billboard, BillboardMode, TextShape, TriggerArea, triggerAreaEventsSystem, AvatarShape } from '@dcl/sdk/ecs'
import { Material, spawnResultItem, hasMaterialAttached, removeRightHandItem, hasItemInRightHand } from './helpers'
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
const CraftingStationSchema = {
  isWorking: Schemas.Boolean,
  workDuration: Schemas.Number, // Work duration in seconds
  workProgress: Schemas.Number, // Work progress (0 to 1)
  resultType: Schemas.String, // Resulting model path
  neededItemId: Schemas.String, // Required item ID
  playerInArea: Schemas.Boolean // Whether the player is in the trigger area
}
const CraftingStationComponent = engine.defineComponent('CraftingStation', CraftingStationSchema)




export class CraftingStation {
  private entity: Entity
  private triggerAreaEntity: Entity
  private spinnerEntity!: Entity
  private workSystemName: string
  private showMessage?: (message: string) => void

  constructor(
    transform: TransformData,
    modelPath: string,
    workDuration: number,
    resultType: ItemType,
    neededItemId: string,
    triggerArea: { position: Vector3, scale: Vector3 },
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
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER, // Removed ColliderLayer.CL_SCENE (does not exist)
      invisibleMeshesCollisionMask: 3
    })
    
    // Add collider for interaction
    MeshCollider.setBox(this.entity, ColliderLayer.CL_POINTER)
    
    // Create trigger area
    this.triggerAreaEntity = engine.addEntity()
    Transform.create(this.triggerAreaEntity, {
      position: triggerArea.position,
      scale: triggerArea.scale
    })
    TriggerArea.setBox(this.triggerAreaEntity)
    
    // Configure trigger area events
    triggerAreaEventsSystem.onTriggerEnter(this.triggerAreaEntity, () => {
      CraftingStationComponent.getMutable(this.entity).playerInArea = true
    })
    
    triggerAreaEventsSystem.onTriggerExit(this.triggerAreaEntity, () => {
      const station = CraftingStationComponent.getMutable(this.entity)
      station.playerInArea = false
      // If it was working, cancel
      if (station.isWorking) {
        station.isWorking = false
        station.workProgress = 0
        this.hideSpinner()
        if (this.showMessage) {
          this.showMessage('Crafting cancelled - left area')
        }
      }
    })
    
    // Create station component
    CraftingStationComponent.create(this.entity, {
      isWorking: false,
      workDuration: workDuration,
      workProgress: 0,
      resultType: resultType as string, // Save as string in the component
      neededItemId: neededItemId,
      playerInArea: false
    })
    
    // Create unique name for the system
    this.workSystemName = `craftingStation-${this.entity}`
    this.showMessage = showMessage
    
    // Configure interaction
    this.setupInteraction()
  }

  private setupInteraction() {
    const station = CraftingStationComponent.get(this.entity)
    const hoverText = station.neededItemId && station.neededItemId !== '' 
      ? 'Start crafting' 
      : `Take ${this.getResourceTypeName(station.resultType)}`
    
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: hoverText,
          maxDistance: 1.5
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
    
    const station = CraftingStationComponent.get(this.entity)
    
    // Check if the player is in the area (only if item is required)
    if (station.neededItemId && station.neededItemId !== '' && !station.playerInArea) {
      if (this.showMessage) {
        this.showMessage('You must be in the crafting area!')
      }
      return
    }
    
    // Check if it's already working
    if (station.isWorking) {
      if (this.showMessage) {
        this.showMessage('Station is already working!')
      }
      return
    }
    
    // Check if the player has the required item (only if required)
    if (station.neededItemId && station.neededItemId !== '') {
      const itemInfo = hasMaterialAttached(station.neededItemId)
      if (!itemInfo.hasItem) {
        if (this.showMessage) {
          this.showMessage(`You need ${station.neededItemId} in your right hand`)
        }
        return
      }
      
      // Remove the item from the player and verify it was removed correctly
      const itemRemoved = removeRightHandItem()
      if (!itemRemoved) {
        if (this.showMessage) {
          this.showMessage('Error: Could not remove item from hand')
        }
        console.error('Failed to remove item from player hand')
        return
      }
      
      // Verify that the item was removed before continuing
      const verifyRemoval = hasMaterialAttached(station.neededItemId)
      if (verifyRemoval.hasItem) {
        if (this.showMessage) {
          this.showMessage('Error: Item still in hand after removal')
        }
        console.error('Item still in hand after removal attempt')
        return
      }
    }
    
    // If workDuration is 0, complete immediately
    if (station.workDuration === 0) {
      // Check that the player doesn't already have an item in hand
      const itemInfo = hasItemInRightHand()
      
      if (itemInfo.hasItem) {
        if (this.showMessage) {
          this.showMessage('You already have something in your right hand')
        }
        return
      }
      
      const resultItemType = station.resultType as ItemType
      spawnResultItem(resultItemType)
      if (this.showMessage) {
        const resourceTypeName = this.getResourceTypeName(station.resultType)
        this.showMessage(`${resourceTypeName} created`)
      }
      return
    }
    
    // Start work
    CraftingStationComponent.getMutable(this.entity).isWorking = true
    CraftingStationComponent.getMutable(this.entity).workProgress = 0
    
    // Show spinner
    this.showSpinner()
    
    // Start work system
    this.startWorkSystem()
    
    if (this.showMessage) {
      this.showMessage('Crafting started!')
    }
  }
  
  private getResourceTypeName(resourceType: string): string {
    // Convert the enum value to a readable name
    switch (resourceType) {
      case ItemType.HERB:
        return 'Herb'
      case ItemType.CUP:
        return 'Cup'
      case ItemType.ORE:
        return 'Ore'
      case ItemType.IRON:
        return 'Iron'
      case ItemType.AXE:
        return 'Axe'
      case ItemType.POTION:
        return 'Potion'
      default:
        const typeStr = String(resourceType)
        return typeStr.charAt(0).toUpperCase() + typeStr.slice(1)
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
      if (!CraftingStationComponent.has(this.entity)) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const station = CraftingStationComponent.get(this.entity)
      
      // If not working, remove the system and exit
      if (!station.isWorking) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const mutableStation = CraftingStationComponent.getMutable(this.entity)
      
      // Verify that the player is still in the area (only if item is required)
      if (mutableStation.neededItemId && mutableStation.neededItemId !== '' && !mutableStation.playerInArea) {
        mutableStation.isWorking = false
        mutableStation.workProgress = 0
        this.hideSpinner()
        engine.removeSystem(this.workSystemName)
        return
      }
      
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
        
        // Make sure there are no items in hand before creating the new one
        // (in case the item wasn't removed correctly at the start)
        if (mutableStation.neededItemId && mutableStation.neededItemId !== '') {
          // Check if there's still an item of the required type in hand
          const verifyItem = hasMaterialAttached(mutableStation.neededItemId)
          if (verifyItem.hasItem) {
            console.warn(`Item ${mutableStation.neededItemId} still in hand, removing it before creating result`)
            removeRightHandItem()
          }
        }
        
        // Create the result entity in the nearby area
        // Make sure resultType is a valid ItemType
        const resultItemType = mutableStation.resultType as ItemType
        if (resultItemType && Object.values(ItemType).includes(resultItemType)) {
          spawnResultItem(resultItemType)
        } else {
          console.error(`Invalid resultType: ${mutableStation.resultType}`)
          if (this.showMessage) {
            this.showMessage('Error: Invalid item type')
          }
        }
        
        // Remove the work system
        engine.removeSystem(this.workSystemName)
        
        if (this.showMessage) {
          this.showMessage('Crafting completed!')
        }
      }
    }, 0, this.workSystemName)
  }

  

  // Method to destroy the station
  public destroy() {
    engine.removeSystem(this.workSystemName)
    engine.removeSystem(`spinnerRotation-${this.entity}`)
    this.hideSpinner()
    engine.removeEntity(this.triggerAreaEntity)
    engine.removeEntity(this.entity)
  }

  // Method to reset the station
  public reset() {
    // Stop work if in progress
    if (CraftingStationComponent.has(this.entity)) {
      const station = CraftingStationComponent.getMutable(this.entity)
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
