import { ReactEcs, UiEntity, Label } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'

let currentMessage: string = ''

// Contadores de entregas
let goodDelivered: number = 0
let badDelivered: number = 0
let wrongItemDelivered: number = 0

export function setMessage(message: string) {
  currentMessage = message
}

export function clearMessage() {
  currentMessage = ''
}

export function getMessage(): string {
  return currentMessage
}

// Funciones para incrementar contadores
export function incrementGoodDelivered() {
  goodDelivered++
}

export function incrementBadDelivered() {
  badDelivered++
}

export function incrementWrongItemDelivered() {
  wrongItemDelivered++
}

export const uiComponent = () => {
  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Contadores permanentes centrados en la parte superior */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          width: 400,
          height: 60,
          position: { top: '10px' },
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          padding: { top: 10, bottom: 10, left: 10, right: 10 }
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.7) }}
      >
        <Label
          value={`Good delivered: ${goodDelivered}`}
          fontSize={18}
          textAlign="top-left"
          color={Color4.Green()}
          uiTransform={{ width: '50%', height: 30 }}
        />
        <Label
          value={`Bad delivered: ${badDelivered}`}
          fontSize={18}
          textAlign="top-left"
          color={Color4.Red()}
          uiTransform={{ width: '50%', height: 30 }}
        />
      </UiEntity>
      
      {/* Mensaje temporal en la parte inferior */}
      {currentMessage !== '' && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            width: '100%',
            height: '80%',
            alignItems: 'flex-end',
            justifyContent: 'center'
          }}
        >
          <Label
            value={currentMessage}
            fontSize={36}
            textAlign="bottom-center"
            color={Color4.White()}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}

