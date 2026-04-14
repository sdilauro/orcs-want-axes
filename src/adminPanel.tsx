import { ReactEcs, UiEntity, Label, Button } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, PlayerIdentityData, AvatarBase, Transform } from '@dcl/sdk/ecs'
import { signedFetch } from '~system/SignedFetch'
import { getSceneInformation, getRealm } from '~system/Runtime'

const API_BASE = 'https://comms-gatekeeper.decentraland.org'

// --- State ---
let panelOpen = false
let activeTab: 'players' | 'banned' = 'players'
let statusMessage = ''
let statusTimeout: number | null = null

interface ScenePlayer {
  address: string
  name: string
}

interface BannedPlayer {
  bannedAddress: string
  name: string
}

interface AdminInfo {
  admin: string
  name: string
  canBeRemoved: boolean
}

let scenePlayers: ScenePlayer[] = []
let bannedPlayers: BannedPlayer[] = []
let adminAddresses: Set<string> = new Set()
let ownerAddress = ''
let isCurrentUserAuthorized = false
let currentUserAddress = ''
let isLoading = false
let authChecked = false
let isPreviewMode = false

// --- Helpers ---
function setStatus(msg: string) {
  statusMessage = msg
  if (statusTimeout !== null) {
    clearTimeout(statusTimeout)
  }
  statusTimeout = setTimeout(() => {
    statusMessage = ''
    statusTimeout = null
  }, 3000) as unknown as number
}

function getScenePlayers(): ScenePlayer[] {
  const players: ScenePlayer[] = []
  for (const [_entity, identity, base] of engine.getEntitiesWith(PlayerIdentityData, AvatarBase)) {
    if (identity.address && base.name) {
      players.push({
        address: identity.address.toLowerCase(),
        name: base.name
      })
    }
  }
  return players
}

// --- API Calls ---
async function fetchBannedPlayers() {
  try {
    const response = await signedFetch({
      url: `${API_BASE}/scene-bans?limit=100&offset=0`,
      init: { method: 'GET', headers: {} }
    })
    if (response.ok) {
      const data = JSON.parse(response.body)
      bannedPlayers = data.results || []
    } else if (response.status === 401 && isPreviewMode) {
      console.log('Admin Panel: Bans API unavailable in preview mode')
    } else {
      console.log('Failed to fetch bans:', response.status)
    }
  } catch (e) {
    console.log('Error fetching bans:', e)
  }
}

async function fetchAdmins() {
  try {
    const response = await signedFetch({
      url: `${API_BASE}/scene-admin`,
      init: { method: 'GET', headers: {} }
    })
    if (response.ok) {
      const data: AdminInfo[] = JSON.parse(response.body)
      adminAddresses.clear()
      for (const admin of data) {
        adminAddresses.add(admin.admin.toLowerCase())
      }
      checkAuthorization()
    } else if (response.status === 401 && isPreviewMode) {
      console.log('Admin Panel: Admins API unavailable in preview mode')
    } else {
      console.log('Failed to fetch admins:', response.status)
    }
  } catch (e) {
    console.log('Error fetching admins:', e)
  }
}

async function fetchOwner() {
  try {
    const info = await getSceneInformation({})
    if (info && info.metadataJson) {
      const metadata = JSON.parse(info.metadataJson)
      if (metadata.owner) {
        ownerAddress = metadata.owner.toLowerCase()
      }
    }
  } catch (e) {
    console.log('Error fetching scene owner:', e)
  }
}

async function detectPreviewMode() {
  try {
    const realm = await getRealm({})
    if (realm && realm.realmInfo) {
      isPreviewMode = realm.realmInfo.isPreview || realm.realmInfo.realmName === 'LocalPreview'
      if (isPreviewMode) {
        console.log('Admin Panel: Preview mode detected, granting access')
        isCurrentUserAuthorized = true
        authChecked = true
      }
    }
  } catch (e) {
    console.log('Error detecting preview mode:', e)
  }
}

function checkAuthorization() {
  if (isPreviewMode) {
    isCurrentUserAuthorized = true
    authChecked = true
    return
  }
  if (!currentUserAddress) return
  const isAdmin = adminAddresses.has(currentUserAddress)
  const isOwner = ownerAddress !== '' && currentUserAddress === ownerAddress
  isCurrentUserAuthorized = isAdmin || isOwner
  authChecked = true
}

async function banPlayer(address: string, name: string) {
  if (isLoading) return
  isLoading = true
  try {
    const response = await signedFetch({
      url: `${API_BASE}/scene-bans`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_address: address, banned_name: name })
      }
    })
    if (response.ok || response.status === 204) {
      setStatus(`Banned ${name}`)
      await fetchBannedPlayers()
    } else {
      setStatus(`Error banning: ${response.status}`)
    }
  } catch (e) {
    setStatus('Error banning player')
    console.log('Ban error:', e)
  }
  isLoading = false
}

async function unbanPlayer(address: string, name: string) {
  if (isLoading) return
  isLoading = true
  try {
    const response = await signedFetch({
      url: `${API_BASE}/scene-bans`,
      init: {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_address: address, banned_name: name })
      }
    })
    if (response.ok || response.status === 204) {
      setStatus(`Unbanned ${name}`)
      await fetchBannedPlayers()
    } else {
      setStatus(`Error unbanning: ${response.status}`)
    }
  } catch (e) {
    setStatus('Error unbanning player')
    console.log('Unban error:', e)
  }
  isLoading = false
}

async function kickPlayer(address: string, name: string) {
  // Kick = ban + immediate unban (forces disconnect via comms adapter 403)
  if (isLoading) return
  isLoading = true
  try {
    // Ban first to force disconnect
    const banRes = await signedFetch({
      url: `${API_BASE}/scene-bans`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned_address: address, banned_name: name })
      }
    })
    if (banRes.ok || banRes.status === 204) {
      // Wait a moment then unban so they can rejoin
      setTimeout(async () => {
        await signedFetch({
          url: `${API_BASE}/scene-bans`,
          init: {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ banned_address: address, banned_name: name })
          }
        })
        await fetchBannedPlayers()
      }, 2000)
      setStatus(`Kicked ${name}`)
    } else {
      setStatus(`Error kicking: ${banRes.status}`)
    }
  } catch (e) {
    setStatus('Error kicking player')
    console.log('Kick error:', e)
  }
  isLoading = false
}

async function addAdmin(address: string, name: string) {
  if (isLoading) return
  isLoading = true
  try {
    const response = await signedFetch({
      url: `${API_BASE}/scene-admin`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin: address, name: name })
      }
    })
    if (response.ok || response.status === 204) {
      setStatus(`${name} is now admin`)
      await fetchAdmins()
    } else {
      setStatus(`Error adding admin: ${response.status}`)
    }
  } catch (e) {
    setStatus('Error adding admin')
    console.log('Add admin error:', e)
  }
  isLoading = false
}

async function removeAdmin(address: string, name: string) {
  if (isLoading) return
  isLoading = true
  try {
    const response = await signedFetch({
      url: `${API_BASE}/scene-admin`,
      init: {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin: address })
      }
    })
    if (response.ok || response.status === 204) {
      setStatus(`Removed admin: ${name}`)
      await fetchAdmins()
    } else {
      setStatus(`Error removing admin: ${response.status}`)
    }
  } catch (e) {
    setStatus('Error removing admin')
    console.log('Remove admin error:', e)
  }
  isLoading = false
}

// --- Initialization ---
async function initAsync() {
  // Detect preview mode first
  await detectPreviewMode()

  // Get current player address (may not be available immediately)
  for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
    if (identity.address) {
      currentUserAddress = identity.address.toLowerCase()
      break
    }
  }

  // Fetch owner from scene metadata
  await fetchOwner()

  // Only call APIs if not in preview mode (they 401 in local preview)
  if (!isPreviewMode) {
    await fetchAdmins()
    await fetchBannedPlayers()
  }

  checkAuthorization()
}

export function initAdminPanel() {
  initAsync()

  // Periodically refresh player list and check auth
  let refreshTimer = 0
  let initialAuthDone = false
  engine.addSystem((dt: number) => {
    refreshTimer += dt
    if (refreshTimer >= 3) {
      refreshTimer = 0

      // Update current user address if not set yet
      if (!currentUserAddress) {
        for (const [_entity, identity] of engine.getEntitiesWith(PlayerIdentityData)) {
          if (identity.address) {
            currentUserAddress = identity.address.toLowerCase()
            // Re-run auth check and fetch data if needed
            if (!initialAuthDone && !isPreviewMode) {
              initialAuthDone = true
              fetchOwner()
              fetchAdmins()
            }
            checkAuthorization()
            break
          }
        }
      }

      // Only refresh player list if authorized
      if (isCurrentUserAuthorized) {
        scenePlayers = getScenePlayers()
      }
    }
  })
}

export function toggleAdminPanel() {
  if (!isCurrentUserAuthorized) return
  panelOpen = !panelOpen
  if (panelOpen) {
    scenePlayers = getScenePlayers()
    if (!isPreviewMode) {
      fetchBannedPlayers()
      fetchAdmins()
    }
  }
}

// --- Colors ---
const BG_PANEL = Color4.create(0.08, 0.08, 0.12, 0.95)
const BG_HEADER = Color4.create(0.15, 0.15, 0.22, 1)
const BG_TAB_ACTIVE = Color4.create(0.3, 0.3, 0.45, 1)
const BG_TAB_INACTIVE = Color4.create(0.15, 0.15, 0.22, 0.7)
const BG_ROW = Color4.create(0.12, 0.12, 0.18, 0.9)
const BG_ROW_ALT = Color4.create(0.15, 0.15, 0.22, 0.9)
const BTN_BAN = Color4.create(0.8, 0.2, 0.2, 0.9)
const BTN_KICK = Color4.create(0.9, 0.6, 0.1, 0.9)
const BTN_ADMIN = Color4.create(0.2, 0.5, 0.8, 0.9)
const BTN_UNBAN = Color4.create(0.2, 0.7, 0.3, 0.9)
const BTN_REMOVE_ADMIN = Color4.create(0.6, 0.3, 0.6, 0.9)
const BTN_TOGGLE = Color4.create(0.3, 0.3, 0.5, 0.85)
const BTN_CLOSE = Color4.create(0.6, 0.15, 0.15, 0.9)
const BTN_REFRESH = Color4.create(0.2, 0.5, 0.7, 0.9)

// --- UI Component ---
export const adminPanelComponent = () => {
  // Only visible for scene owners and admins
  if (!isCurrentUserAuthorized) return null

  return (
    <UiEntity
      uiTransform={{
        positionType: 'absolute',
        width: '100%',
        height: '100%'
      }}
    >
      {/* Toggle Button */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          width: 36,
          height: 36,
          position: { bottom: 10, right: 10 }
        }}
        uiBackground={{ color: BTN_TOGGLE }}
        uiText={{ value: '\u2699', fontSize: 22, textAlign: 'middle-center', color: Color4.White() }}
        onMouseDown={() => toggleAdminPanel()}
      />

      {/* Panel */}
      {panelOpen && (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            width: 480,
            height: 500,
            position: { bottom: 50, right: 10 },
            flexDirection: 'column'
          }}
          uiBackground={{ color: BG_PANEL }}
        >
          {/* Header */}
          <UiEntity
            uiTransform={{
              width: '100%',
              height: 40,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: { left: 12, right: 8 }
            }}
            uiBackground={{ color: BG_HEADER }}
          >
            <Label
              value="Admin Panel"
              fontSize={16}
              color={Color4.White()}
              uiTransform={{ width: 200, height: 30 }}
            />
            {/* Refresh button */}
            <UiEntity
              uiTransform={{ width: 70, height: 28, margin: { right: 8 } }}
              uiBackground={{ color: BTN_REFRESH }}
              uiText={{ value: 'Refresh', fontSize: 12, textAlign: 'middle-center', color: Color4.White() }}
              onMouseDown={() => {
                scenePlayers = getScenePlayers()
                if (!isPreviewMode) {
                  fetchBannedPlayers()
                  fetchAdmins()
                }
                setStatus('Refreshed')
              }}
            />
            {/* Close button */}
            <UiEntity
              uiTransform={{ width: 28, height: 28 }}
              uiBackground={{ color: BTN_CLOSE }}
              uiText={{ value: 'X', fontSize: 14, textAlign: 'middle-center', color: Color4.White() }}
              onMouseDown={() => { panelOpen = false }}
            />
          </UiEntity>

          {/* Tabs */}
          <UiEntity
            uiTransform={{
              width: '100%',
              height: 34,
              flexDirection: 'row'
            }}
          >
            <UiEntity
              uiTransform={{ width: '50%', height: '100%' }}
              uiBackground={{ color: activeTab === 'players' ? BG_TAB_ACTIVE : BG_TAB_INACTIVE }}
              uiText={{
                value: `Players (${scenePlayers.length})`,
                fontSize: 14,
                textAlign: 'middle-center',
                color: Color4.White()
              }}
              onMouseDown={() => {
                activeTab = 'players'
                scenePlayers = getScenePlayers()
              }}
            />
            <UiEntity
              uiTransform={{ width: '50%', height: '100%' }}
              uiBackground={{ color: activeTab === 'banned' ? BG_TAB_ACTIVE : BG_TAB_INACTIVE }}
              uiText={{
                value: `Banned (${bannedPlayers.length})`,
                fontSize: 14,
                textAlign: 'middle-center',
                color: Color4.White()
              }}
              onMouseDown={() => {
                activeTab = 'banned'
                fetchBannedPlayers()
              }}
            />
          </UiEntity>

          {/* Content Area */}
          <UiEntity
            uiTransform={{
              width: '100%',
              flexGrow: 1,
              flexDirection: 'column',
              overflow: 'scroll',
              padding: { top: 4, bottom: 4, left: 4, right: 4 }
            }}
          >
            {activeTab === 'players' && renderPlayersList()}
            {activeTab === 'banned' && renderBannedList()}
          </UiEntity>

          {/* Status Bar */}
          {statusMessage !== '' && (
            <UiEntity
              uiTransform={{
                width: '100%',
                height: 28,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              uiBackground={{ color: Color4.create(0.1, 0.1, 0.15, 1) }}
            >
              <Label
                value={statusMessage}
                fontSize={12}
                color={Color4.Yellow()}
                uiTransform={{ width: '100%', height: 24 }}
                textAlign="middle-center"
              />
            </UiEntity>
          )}
        </UiEntity>
      )}
    </UiEntity>
  )
}

function renderPlayersList() {
  const filteredPlayers = scenePlayers.filter(p => p.address !== currentUserAddress && p.name !== '')

  if (filteredPlayers.length === 0) {
    return (
      <UiEntity
        uiTransform={{ width: '100%', height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <Label
          value="No other players in scene"
          fontSize={14}
          color={Color4.Gray()}
          uiTransform={{ width: '100%', height: 30 }}
          textAlign="middle-center"
        />
      </UiEntity>
    )
  }

  return filteredPlayers.map((player, index) => {
    const isAdmin = adminAddresses.has(player.address)
    const bgColor = index % 2 === 0 ? BG_ROW : BG_ROW_ALT

    return (
      <UiEntity
        key={player.address}
        uiTransform={{
          width: '100%',
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 8, right: 4, top: 2, bottom: 2 },
          margin: { bottom: 2 }
        }}
        uiBackground={{ color: bgColor }}
      >
        {/* Player name + admin badge */}
        <UiEntity
          uiTransform={{ flexGrow: 1, height: 36, flexDirection: 'column', justifyContent: 'center' }}
        >
          <Label
            value={player.name + (isAdmin ? ' [ADMIN]' : '')}
            fontSize={13}
            color={isAdmin ? Color4.create(0.4, 0.7, 1, 1) : Color4.White()}
            uiTransform={{ width: '100%', height: 18 }}
            textAlign="middle-left"
          />
          <Label
            value={player.address.substring(0, 8) + '...' + player.address.substring(player.address.length - 6)}
            fontSize={10}
            color={Color4.Gray()}
            uiTransform={{ width: '100%', height: 14 }}
            textAlign="middle-left"
          />
        </UiEntity>

        {/* Action Buttons */}
        <UiEntity
          uiTransform={{ width: 60, height: 28, margin: { left: 4 } }}
          uiBackground={{ color: BTN_KICK }}
          uiText={{ value: 'Kick', fontSize: 11, textAlign: 'middle-center', color: Color4.White() }}
          onMouseDown={() => kickPlayer(player.address, player.name)}
        />
        <UiEntity
          uiTransform={{ width: 52, height: 28, margin: { left: 4 } }}
          uiBackground={{ color: BTN_BAN }}
          uiText={{ value: 'Ban', fontSize: 11, textAlign: 'middle-center', color: Color4.White() }}
          onMouseDown={() => banPlayer(player.address, player.name)}
        />
        {!isAdmin ? (
          <UiEntity
            uiTransform={{ width: 64, height: 28, margin: { left: 4 } }}
            uiBackground={{ color: BTN_ADMIN }}
            uiText={{ value: 'Admin', fontSize: 11, textAlign: 'middle-center', color: Color4.White() }}
            onMouseDown={() => addAdmin(player.address, player.name)}
          />
        ) : (
          <UiEntity
            uiTransform={{ width: 64, height: 28, margin: { left: 4 } }}
            uiBackground={{ color: BTN_REMOVE_ADMIN }}
            uiText={{ value: 'Unadmin', fontSize: 10, textAlign: 'middle-center', color: Color4.White() }}
            onMouseDown={() => removeAdmin(player.address, player.name)}
          />
        )}
      </UiEntity>
    )
  })
}

function renderBannedList() {
  if (bannedPlayers.length === 0) {
    return (
      <UiEntity
        uiTransform={{ width: '100%', height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <Label
          value="No banned players"
          fontSize={14}
          color={Color4.Gray()}
          uiTransform={{ width: '100%', height: 30 }}
          textAlign="middle-center"
        />
      </UiEntity>
    )
  }

  return bannedPlayers.map((banned, index) => {
    const bgColor = index % 2 === 0 ? BG_ROW : BG_ROW_ALT

    return (
      <UiEntity
        key={banned.bannedAddress}
        uiTransform={{
          width: '100%',
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          padding: { left: 8, right: 4, top: 2, bottom: 2 },
          margin: { bottom: 2 }
        }}
        uiBackground={{ color: bgColor }}
      >
        {/* Banned player info */}
        <UiEntity
          uiTransform={{ flexGrow: 1, height: 36, flexDirection: 'column', justifyContent: 'center' }}
        >
          <Label
            value={banned.name || 'Unknown'}
            fontSize={13}
            color={Color4.create(1, 0.5, 0.5, 1)}
            uiTransform={{ width: '100%', height: 18 }}
            textAlign="middle-left"
          />
          <Label
            value={banned.bannedAddress.substring(0, 8) + '...' + banned.bannedAddress.substring(banned.bannedAddress.length - 6)}
            fontSize={10}
            color={Color4.Gray()}
            uiTransform={{ width: '100%', height: 14 }}
            textAlign="middle-left"
          />
        </UiEntity>

        {/* Unban Button */}
        <UiEntity
          uiTransform={{ width: 70, height: 28, margin: { left: 4 } }}
          uiBackground={{ color: BTN_UNBAN }}
          uiText={{ value: 'Unban', fontSize: 11, textAlign: 'middle-center', color: Color4.White() }}
          onMouseDown={() => unbanPlayer(banned.bannedAddress, banned.name)}
        />
      </UiEntity>
    )
  })
}
