import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { engine, Transform, Entity, GltfContainer, MeshCollider, ColliderLayer, pointerEventsSystem, InputAction, Schemas, AvatarAttach, AvatarAnchorPointType, MeshRenderer, Material as MaterialECS, AvatarShape } from '@dcl/sdk/ecs'
import { Material, ItemType, getItemModelAndScale } from './helpers'
import { isGameOverActive } from './ui'

// Tipo para los datos de Transform
type TransformData = {
  position: Vector3
  rotation?: Quaternion
  scale?: Vector3
  parent?: Entity
}

// Función helper para verificar si el jugador tiene algo attachado a la mano derecha
function hasSomethingInRightHand(): boolean {
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
          return true
        }
      }
    }
  } catch (error) {
    console.error('Error en hasSomethingInRightHand:', error)
  }
  return false
}


export class StorageStation {
  private entity: Entity
  private resourceType: ItemType
  private showMessage?: (message: string) => void
  private resultPosition: Vector3
  private currentItemEntity: Entity | null = null
  private pickupSystemName: string

  constructor(
    transform: TransformData,
    modelPath: string,
    resourceType: ItemType,
    resultPosition: Vector3,
    showMessage?: (message: string) => void
  ) {
    // Crear la entidad
    this.entity = engine.addEntity()
    
    // Aplicar transform
    Transform.create(this.entity, transform)
    
    // Cargar el modelo
    GltfContainer.create(this.entity, {
      src: modelPath
    })
    
    // Agregar collider para interacción
    MeshCollider.setBox(this.entity, ColliderLayer.CL_POINTER)
    
    // Guardar tipo de recurso y callback
    this.resourceType = resourceType
    this.showMessage = showMessage
    this.resultPosition = resultPosition
    this.pickupSystemName = `storagePickup-${this.entity}`
    
    // Configurar interacción
    this.setupInteraction()
  }

  private setupInteraction() {
    // Obtener el nombre del item desde el enum ItemType
    const resourceTypeName = this.getResourceTypeName()
    
    pointerEventsSystem.onPointerDown(
      {
        entity: this.entity,
        opts: {
          button: InputAction.IA_POINTER,
          hoverText: `Take ${resourceTypeName}`,
          maxDistance: 1.5
        }
      },
      () => {
        this.handleInteraction()
      }
    )
  }

  private getResourceTypeName(): string {
    // Convertir el enum value a un nombre legible
    switch (this.resourceType) {
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
        const typeStr = String(this.resourceType)
        return typeStr.charAt(0).toUpperCase() + typeStr.slice(1)
    }
  }

  private handleInteraction() {
    // Verificar si el juego está en estado de game over
    if (isGameOverActive()) {
      return
    }
    
    // Verificar si el jugador ya tiene algo en la mano derecha
    if (hasSomethingInRightHand()) {
      if (this.showMessage) {
        this.showMessage('You already have something in your right hand')
      }
      return
    }
    
    // Si ya hay un item en el piso, no crear otro
    if (this.currentItemEntity && Transform.has(this.currentItemEntity)) {
      return
    }
    
    // Crear el item en el piso
    this.spawnItemOnFloor()
    
    const resourceTypeName = this.getResourceTypeName()
    if (this.showMessage) {
      this.showMessage(`${resourceTypeName} created`)
    }
  }

  private spawnItemOnFloor() {
    const { modelPath, scale } = getItemModelAndScale(this.resourceType)
    
    if (!modelPath) {
      console.error(`No model path for item type: ${this.resourceType}`)
      return
    }
    
    // Crear entidad del item
    this.currentItemEntity = engine.addEntity()
    
    Transform.create(this.currentItemEntity, {
      position: this.resultPosition,
      rotation: Quaternion.fromEulerDegrees(0, 0, 0),
      scale: scale
    })
    
    // Cargar el modelo
    GltfContainer.create(this.currentItemEntity, {
      src: modelPath
    })
    
    // Agregar collider
    MeshCollider.setBox(this.currentItemEntity, ColliderLayer.CL_POINTER)
    
    // Agregar componente Material
    Material.create(this.currentItemEntity, {
      id: this.resourceType
    })
    
    // Iniciar sistema de recogida automática
    this.startAutoPickupSystem()
  }

  private startAutoPickupSystem() {
    // Remover sistema anterior si existe
    try {
      engine.removeSystem(this.pickupSystemName)
    } catch (e) {
      // El sistema no existe, está bien
    }
    
    engine.addSystem((dt: number) => {
      // Si el item ya no existe, remover el sistema
      if (!this.currentItemEntity || !Transform.has(this.currentItemEntity)) {
        engine.removeSystem(this.pickupSystemName)
        this.currentItemEntity = null
        return
      }
      
      // Verificar si el jugador tiene las manos vacías
      if (hasSomethingInRightHand()) {
        return
      }
      
      // Obtener posición del jugador
      let playerPosition: Vector3 | null = null
      try {
        // Intentar obtener la posición del jugador desde engine.PlayerEntity
        if (Transform.has(engine.PlayerEntity)) {
          playerPosition = Transform.get(engine.PlayerEntity).position
        }
      } catch (e) {
        // Si no se puede obtener, salir
        return
      }
      
      if (!playerPosition) {
        return
      }
      
      // Obtener posición del item
      const itemPosition = Transform.get(this.currentItemEntity).position
      
      // Calcular distancia
      const distance = Vector3.distance(playerPosition, itemPosition)
      
      // Si el jugador está cerca (menos de 1.5 metros), recoger automáticamente
      if (distance < 1.5) {
        this.pickupItem(this.currentItemEntity)
        engine.removeSystem(this.pickupSystemName)
        this.currentItemEntity = null
      }
    }, 0, this.pickupSystemName)
  }

  private pickupItem(itemEntity: Entity) {
    // Obtener información del item
    const itemTransform = Transform.get(itemEntity)
    const itemGltf = GltfContainer.get(itemEntity)
    const { scale } = getItemModelAndScale(this.resourceType)
    
    // Remover la entidad del mundo
    engine.removeEntity(itemEntity)
    
    // Crear una nueva entidad para attachear
    const attachedEntity = engine.addEntity()
    
    // Copiar el transform
    Transform.create(attachedEntity, {
      position: Vector3.create(0, 0, 0),
      rotation: itemTransform.rotation,
      scale: scale
    })
    
    // Cargar el mismo modelo
    GltfContainer.create(attachedEntity, {
      src: itemGltf.src,
      visibleMeshesCollisionMask: 0,
      invisibleMeshesCollisionMask: 0
    })
    
    // Agregar componente Material
    Material.create(attachedEntity, {
      id: this.resourceType
    })
    
    // Attachear a la mano derecha del jugador
    AvatarAttach.create(attachedEntity, {
      anchorPointId: AvatarAnchorPointType.AAPT_RIGHT_HAND
    })
    
    const resourceTypeName = this.getResourceTypeName()
    if (this.showMessage) {
      this.showMessage(`Picked up ${resourceTypeName}`)
    }
  }

  public getResourceType(): ItemType {
    return this.resourceType
  }

  public getEntity(): Entity {
    return this.entity
  }

  // Método para destruir la estación
  public destroy() {
    engine.removeSystem(this.pickupSystemName)
    if (this.currentItemEntity && Transform.has(this.currentItemEntity)) {
      engine.removeEntity(this.currentItemEntity)
    }
    engine.removeEntity(this.entity)
  }

  // Método para reiniciar la estación
  public reset() {
    // Eliminar el item actual del piso si existe
    if (this.currentItemEntity && Transform.has(this.currentItemEntity)) {
      engine.removeEntity(this.currentItemEntity)
      this.currentItemEntity = null
    }
    
    // Eliminar sistema de pickup
    try {
      engine.removeSystem(this.pickupSystemName)
    } catch (e) {
      // El sistema no existe, está bien
    }
  }
}

