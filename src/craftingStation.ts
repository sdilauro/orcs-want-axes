import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, MeshRenderer, Material as MaterialECS, Billboard, BillboardMode, TextShape, TriggerArea, triggerAreaEventsSystem, AvatarShape } from '@dcl/sdk/ecs'
import { Material, ItemType, spawnResultItem } from './helpers'

// Tipo para los datos de Transform
type TransformData = {
  position: Vector3
  rotation?: Quaternion
  scale?: Vector3
  parent?: Entity
}

// Componente para almacenar el estado de la estación
const CraftingStationSchema = {
  isWorking: Schemas.Boolean,
  workDuration: Schemas.Number, // Duración del trabajo en segundos
  workProgress: Schemas.Number, // Progreso del trabajo (0 a 1)
  resultType: Schemas.String, // Ruta del modelo resultante
  neededItemId: Schemas.String, // ID del item necesario
  playerInArea: Schemas.Boolean // Si el jugador está en el trigger area
}
const CraftingStationComponent = engine.defineComponent('CraftingStation', CraftingStationSchema)

// Función helper para verificar si el jugador tiene un material específico attachado
function hasMaterialAttached(materialId: string): boolean {
  try {
    // Obtener todos los NPCs para excluirlos
    const npcAvatarIds = new Set<string>()
    for (const [entity, avatarShape] of engine.getEntitiesWith(AvatarShape)) {
      // Los NPCs tienen name vacío, el jugador tiene un name
      if (avatarShape.name === '') {
        npcAvatarIds.add(avatarShape.id)
      }
    }
    
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        // Solo considerar items del jugador, no de NPCs
        if (!avatarAttach.avatarId || !npcAvatarIds.has(avatarAttach.avatarId)) {
          if (Material.has(entity)) {
            const item = Material.get(entity)
            if (item && item.id === materialId) {
              return true
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en hasMaterialAttached:', error)
  }
  return false
}

// Función helper para eliminar el material attachado a la mano derecha
function removeRightHandItem() {
  try {
    for (const [entity, avatarAttach] of engine.getEntitiesWith(AvatarAttach)) {
      if (avatarAttach.anchorPointId === AvatarAnchorPointType.AAPT_RIGHT_HAND) {
        engine.removeEntity(entity)
        return
      }
    }
  } catch (error) {
    console.error('Error    en removeRightHandItem:', error)
  }
}



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
    // Crear la entidad
    this.entity = engine.addEntity()
    
    // Aplicar transform
    Transform.create(this.entity, {
      position: transform.position,
      rotation: transform.rotation || Quaternion.fromEulerDegrees(0, 0, 0),
      scale: transform.scale || Vector3.create(1, 1, 1),
      parent: transform.parent
    })
    
    // Cargar el modelo
    GltfContainer.create(this.entity, {
      src: modelPath,
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER, // Removed ColliderLayer.CL_SCENE (does not exist)
      invisibleMeshesCollisionMask: 3
    })
    
    // Agregar collider para interacción
    MeshCollider.setBox(this.entity, ColliderLayer.CL_POINTER)
    
    // Crear trigger area
    this.triggerAreaEntity = engine.addEntity()
    Transform.create(this.triggerAreaEntity, {
      position: triggerArea.position,
      scale: triggerArea.scale
    })
    TriggerArea.setBox(this.triggerAreaEntity)
    
    // Configurar eventos del trigger area
    triggerAreaEventsSystem.onTriggerEnter(this.triggerAreaEntity, () => {
      CraftingStationComponent.getMutable(this.entity).playerInArea = true
    })
    
    triggerAreaEventsSystem.onTriggerExit(this.triggerAreaEntity, () => {
      const station = CraftingStationComponent.getMutable(this.entity)
      station.playerInArea = false
      // Si estaba trabajando, cancelar
      if (station.isWorking) {
        station.isWorking = false
        station.workProgress = 0
        this.hideSpinner()
        if (this.showMessage) {
          this.showMessage('Crafting cancelled - left area')
        }
      }
    })
    
    // Crear componente de estación
    CraftingStationComponent.create(this.entity, {
      isWorking: false,
      workDuration: workDuration,
      workProgress: 0,
      resultType: resultType as string, // Guardar como string en el componente
      neededItemId: neededItemId,
      playerInArea: false
    })
    
    // Crear nombre único para el sistema
    this.workSystemName = `craftingStation-${this.entity}`
    this.showMessage = showMessage
    
    // Configurar interacción
    this.setupInteraction()
  }

  private setupInteraction() {
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: 'Start crafting',
          maxDistance: 1.5
        }
      },
      () => {
        this.handleInteraction()
      }
    )
  }

  private handleInteraction() {
    const station = CraftingStationComponent.get(this.entity)
    
    // Verificar si el jugador está en el área
    if (!station.playerInArea) {
      if (this.showMessage) {
        this.showMessage('You must be in the crafting area!')
      }
      return
    }
    
    // Verificar si ya está trabajando
    if (station.isWorking) {
      if (this.showMessage) {
        this.showMessage('Station is already working!')
      }
      return
    }
    
    // Verificar si el jugador tiene el item necesario
    if (!hasMaterialAttached(station.neededItemId)) {
      if (this.showMessage) {
        this.showMessage(`You need ${station.neededItemId} in your right hand`)
      }
      return
    }
    
    // Iniciar trabajo
    CraftingStationComponent.getMutable(this.entity).isWorking = true
    CraftingStationComponent.getMutable(this.entity).workProgress = 0
    
    // Remover el item del jugador
    removeRightHandItem()
    
    // Mostrar spinner
    this.showSpinner()
    
    // Iniciar sistema de trabajo
    this.startWorkSystem()
    
    if (this.showMessage) {
      this.showMessage('Crafting started!')
    }
  }

  private showSpinner() {
    // Crear entidad del spinner como hijo de la estación
    this.spinnerEntity = engine.addEntity()
    
    const stationTransform = Transform.get(this.entity)
    const stationScale = stationTransform.scale || Vector3.create(1, 1, 1)
    const inverseScale = Vector3.create(
      1 / stationScale.x,
      1 / stationScale.y,
      1 / stationScale.z
    )
    
    Transform.create(this.spinnerEntity, {
      position: Vector3.create(0, 3, 0), // 3 metros arriba de la estación
      scale: inverseScale,
      parent: this.entity
    })
    
    // Crear un círculo/plano como spinner
    MeshRenderer.setPlane(this.spinnerEntity)
    MaterialECS.setPbrMaterial(this.spinnerEntity, {
      albedoColor: Color4.create(1, 1, 0, 0.8), // Amarillo semitransparente
      emissiveColor: Color4.create(1, 1, 0, 0.5) // Brillo amarillo
    })
    
    // Hacer que el spinner siempre mire a la cámara
    Billboard.create(this.spinnerEntity, {
      billboardMode: BillboardMode.BM_Y
    })
    
    // Rotar el spinner continuamente
    const rotationSpeed = 360 // grados por segundo
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
    // Verificar si el sistema ya existe para evitar duplicados
    try {
      engine.removeSystem(this.workSystemName)
    } catch (e) {
      // El sistema no existe, está bien
    }
    
    engine.addSystem((dt: number) => {
      if (!CraftingStationComponent.has(this.entity)) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const station = CraftingStationComponent.get(this.entity)
      
      // Si no está trabajando, remover el sistema y salir
      if (!station.isWorking) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const mutableStation = CraftingStationComponent.getMutable(this.entity)
      
      // Verificar que el jugador siga en el área
      if (!mutableStation.playerInArea) {
        mutableStation.isWorking = false
        mutableStation.workProgress = 0
        this.hideSpinner()
        engine.removeSystem(this.workSystemName)
        return
      }
      
      // Actualizar progreso
      mutableStation.workProgress += dt / mutableStation.workDuration
      
      // Si el trabajo está completo
      if (mutableStation.workProgress >= 1.0) {
        mutableStation.isWorking = false
        mutableStation.workProgress = 0
        
        // Ocultar spinner
        this.hideSpinner()
        
        // Crear la entidad resultado en el área cercana
        // Asegurarse de que resultType sea un ItemType válido
        const resultItemType = mutableStation.resultType as ItemType
        if (resultItemType && Object.values(ItemType).includes(resultItemType)) {
          spawnResultItem(resultItemType)
        } else {
          console.error(`Invalid resultType: ${mutableStation.resultType}`)
          if (this.showMessage) {
            this.showMessage('Error: Invalid item type')
          }
        }
        
        // Remover el sistema de trabajo
        engine.removeSystem(this.workSystemName)
        
        if (this.showMessage) {
          this.showMessage('Crafting completed!')
        }
      }
    }, 0, this.workSystemName)
  }

  

  // Método para destruir la estación
  public destroy() {
    engine.removeSystem(this.workSystemName)
    engine.removeSystem(`spinnerRotation-${this.entity}`)
    this.hideSpinner()
    engine.removeEntity(this.triggerAreaEntity)
    engine.removeEntity(this.entity)
  }
}
