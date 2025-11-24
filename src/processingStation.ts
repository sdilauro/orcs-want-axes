import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, MeshRenderer, Material as MaterialECS, Billboard, BillboardMode, AvatarShape } from '@dcl/sdk/ecs'
import { Material, ItemType, getItemTypeFromModelPath } from './helpers'
import { isGameOverActive } from './ui'

// Tipo para los datos de Transform
type TransformData = {
  position: Vector3
  rotation?: Quaternion
  scale?: Vector3
  parent?: Entity
}

// Componente para almacenar el estado de la estación
const ProcessingStationSchema = {
  isWorking: Schemas.Boolean,
  workDuration: Schemas.Number, // Duración del trabajo en segundos
  workProgress: Schemas.Number, // Progreso del trabajo (0 a 1)
  resultModel: Schemas.String, // Ruta del modelo resultante
  neededItemId: Schemas.String // ID del item necesario
}
const ProcessingStationComponent = engine.defineComponent('ProcessingStation', ProcessingStationSchema)

// Función helper para verificar si el jugador tiene un material específico attachado
function hasMaterialAttached(materialId: string): { hasItem: boolean, itemEntity?: Entity } {
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
              return { hasItem: true, itemEntity: entity }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error en hasMaterialAttached:', error)
  }
  return { hasItem: false }
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
    console.error('Error en removeRightHandItem:', error)
  }
}


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
      visibleMeshesCollisionMask: ColliderLayer.CL_POINTER | ColliderLayer.CL_PHYSICS, // CL_SCENE does not exist, using CL_PHYSICS as likely intended
      invisibleMeshesCollisionMask: 3
    })
    
    // Agregar collider para interacción
    MeshCollider.setBox(this.entity, ColliderLayer.CL_POINTER)
    
    // Crear componente de estación
    ProcessingStationComponent.create(this.entity, {
      isWorking: false,
      workDuration: workDuration,
      workProgress: 0,
      resultModel: modelPathResult,
      neededItemId: neededItemId
    })
    
    // Crear nombre único para el sistema
    this.workSystemName = `processingStation-${this.entity}`
    this.showMessage = showMessage
    this.resultPosition = resultPosition
    
    // Configurar interacción
    this.setupInteraction()
    
    // No iniciar el sistema de trabajo hasta que se necesite
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
    // Verificar si el juego está en estado de game over
    if (isGameOverActive()) {
      return
    }
    
    const station = ProcessingStationComponent.get(this.entity)
    
    // Verificar si ya está trabajando
    if (station.isWorking) {
      if (this.showMessage) {
        this.showMessage('Station is already processing!')
      }
      return
    }
    
    // Verificar si el jugador tiene el item necesario
    const itemInfo = hasMaterialAttached(station.neededItemId)
    if (!itemInfo.hasItem || !itemInfo.itemEntity) {
      if (this.showMessage) {
        this.showMessage(`You need ${station.neededItemId} in your right hand`)
      }
      return
    }
    
    // Iniciar trabajo
    ProcessingStationComponent.getMutable(this.entity).isWorking = true
    ProcessingStationComponent.getMutable(this.entity).workProgress = 0
    
    // Remover el item del jugador
    removeRightHandItem()
    
    // Mostrar spinner
    this.showSpinner()
    
    // Iniciar sistema de trabajo solo cuando se necesita
    this.startWorkSystem()
    
    if (this.showMessage) {
      this.showMessage('Processing started!')
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
      if (!ProcessingStationComponent.has(this.entity)) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const station = ProcessingStationComponent.get(this.entity)
      
      // Si no está trabajando, remover el sistema y salir
      if (!station.isWorking) {
        engine.removeSystem(this.workSystemName)
        return
      }
      
      const mutableStation = ProcessingStationComponent.getMutable(this.entity)
      
      // Actualizar progreso
      mutableStation.workProgress += dt / mutableStation.workDuration
      
      // Si el trabajo está completo
      if (mutableStation.workProgress >= 1.0) {
        mutableStation.isWorking = false
        mutableStation.workProgress = 0
        
        // Ocultar spinner
        this.hideSpinner()
        
        // Attachear el resultado a la mano derecha del jugador
        this.attachResultToPlayer(mutableStation.resultModel)
        
        // Remover el sistema de trabajo
        engine.removeSystem(this.workSystemName)
        
        if (this.showMessage) {
          this.showMessage('Processing completed!')
        }
      }
    }, 0, this.workSystemName)
  }

  private attachResultToPlayer(modelPath: string) {
    // Spawnea el resultado en la posición especificada
    const resultEntity = engine.addEntity()
    
    Transform.create(resultEntity, {
      position: this.resultPosition,
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: Vector3.create(1, 1, 1)
    })
    
    // Cargar el modelo
    GltfContainer.create(resultEntity, {
      src: modelPath
    })
    
    // Agregar collider para que pueda ser recogido
    MeshCollider.setBox(resultEntity, ColliderLayer.CL_POINTER)
    
    // Agregar componente Material con el tipo correcto
    const itemType = getItemTypeFromModelPath(modelPath)
    Material.create(resultEntity, {
      id: itemType
    })
    
    // Agregar interacción para attachear a la mano derecha
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
    // Verificar si el jugador ya tiene algo en la mano derecha
    let hasItem = false
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
            hasItem = true
            break
          }
        }
      }
    } catch (error) {
      console.error('Error checking right hand:', error)
    }
    
    if (hasItem) {
      if (this.showMessage) {
        this.showMessage('You already have something in your right hand')
      }
      return
    }
    
    // Obtener el transform de la entidad antes de attachearla
    const itemTransform = Transform.get(itemEntity)
    const itemGltf = GltfContainer.get(itemEntity)
    
    // Obtener el tipo de item del componente Material si existe
    let itemType: string = ItemType.HERB // fallback
    if (Material.has(itemEntity)) {
      const material = Material.get(itemEntity)
      if (material) {
        itemType = material.id
      }
    } else {
      // Si no tiene componente Material, intentar determinarlo por el modelo
      itemType = getItemTypeFromModelPath(itemGltf.src)
    }
    
    // Remover la entidad del mundo
    engine.removeEntity(itemEntity)
    
    // Crear una nueva entidad para attachear
    const attachedEntity = engine.addEntity()
    
    // Copiar el transform (escala y rotación)
    Transform.create(attachedEntity, {
      position: Vector3.create(0, 0, 0),
      rotation: itemTransform.rotation,
      scale: itemTransform.scale || Vector3.create(1, 1, 1)
    })
    
    // Cargar el mismo modelo
    GltfContainer.create(attachedEntity, {
      src: itemGltf.src,
      visibleMeshesCollisionMask: 0, // Sin colisiones visibles
      invisibleMeshesCollisionMask: 0 // Sin colisiones invisibles
    })
    
    // Agregar componente Material con el tipo correcto
    Material.create(attachedEntity, {
      id: itemType
    })
    
    // Attachear a la mano derecha del jugador
    AvatarAttach.create(attachedEntity, {
      anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
    })
    
    if (this.showMessage) {
      this.showMessage('Item picked up')
    }
  }

  // Método para destruir la estación
  public destroy() {
    engine.removeSystem(this.workSystemName)
    engine.removeSystem(`spinnerRotation-${this.entity}`)
    this.hideSpinner()
    engine.removeEntity(this.entity)
  }

  // Método para reiniciar la estación
  public reset() {
    // Detener el trabajo si está en progreso
    if (ProcessingStationComponent.has(this.entity)) {
      const station = ProcessingStationComponent.getMutable(this.entity)
      station.isWorking = false
      station.workProgress = 0
    }
    
    // Ocultar spinner si existe
    this.hideSpinner()
    
    // Eliminar sistema de trabajo
    try {
      engine.removeSystem(this.workSystemName)
    } catch (e) {
      // El sistema no existe, está bien
    }
  }
}

