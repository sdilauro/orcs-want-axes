import { ReactEcs, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { gameOver, resetGame } from './helpers'

let currentMessage: string = ''

// Contadores de entregas
let goodDelivered: number = 0
let badDelivered: number = 0

// Estado de game over
let isGameOver: boolean = false
let showPlayAgainButton: boolean = false

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
  if (badDelivered >= 3) {
    gameOver()
  }
}

export function getBadDelivered(): number {
  return badDelivered
}

// Funciones para controlar el estado de game over
export function setGameOverState(value: boolean) {
  isGameOver = value
  showPlayAgainButton = value
}

export function resetCounters() {
  goodDelivered = 0
  badDelivered = 0
}

export function hidePlayAgainButton() {
  showPlayAgainButton = false
}

// Función para verificar si el juego está en estado de game over
export function isGameOverActive(): boolean {
  return isGameOver
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
      {/* Contadores permanentes centrados en la parte superior - ocultos en game over */}
      {!isGameOver && (
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
      )}
      
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

      {/* Botón Play Again en la parte inferior - solo visible cuando showPlayAgainButton es true */}
      {showPlayAgainButton && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            width: 300,
            height: 80,
            position: { bottom: '50px' },
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Button
            value="Play Again"
            fontSize={24}
            textAlign="middle-center"
            color={Color4.White()}
            uiTransform={{
              width: '100%',
              height: '100%'
            }}
            uiBackground={{
              color: Color4.create(0.2, 0.6, 0.2, 0.9)
            }}
            onMouseDown={() => {
              resetGame()
            }}
          />
        </UiEntity>
      )}
    </UiEntity>
  )
}

