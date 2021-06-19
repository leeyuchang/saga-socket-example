import { delay, eventChannel } from 'redux-saga'
import {
  call,
  cancelled,
  put,
  race,
  take,
  takeLatest,
} from 'redux-saga/effects'
import { createSelector } from 'reselect'
import io from 'socket.io-client'

const ADD_TASK = 'ADD_TASK'
const START_CHANNEL = 'START_CHANNEL'
const STOP_CHANNEL = 'STOP_CHANNEL'
const CHANNEL_ON = 'CHANNEL_ON'
const CHANNEL_OFF = 'CHANNEL_OFF'
const SERVER_ON = 'SERVER_ON'
const SERVER_OFF = 'SERVER_OFF'

const INSERT = 'socket/INSERT'

const socketServerURL = 'http://localhost:3000'
let socket

const initialState = {
  taskList: [],
  channelStatus: 'off',
  serverStatus: 'unknown',
}

export default (state = initialState, action) => {
  switch (action.type) {
    case CHANNEL_ON:
      return { ...state, channelStatus: 'on' }
    case CHANNEL_OFF:
      return { ...state, channelStatus: 'off', serverStatus: 'unknown' }
    case ADD_TASK:
      return { ...state, taskList: [...state.taskList, action.payload] }
    case SERVER_OFF:
      return { ...state, serverStatus: 'off' }
    case SERVER_ON:
      return { ...state, serverStatus: 'on' }
    default:
      return state
  }
}

// action creators for Stop and Start buttons. You can also put them into componentDidMount
export const startChannel = () => ({ type: START_CHANNEL })
export const stopChannel = () => ({ type: STOP_CHANNEL })
export const insert = (orderID) => ({ type: INSERT, payload: orderID })

// sorting function to show the latest tasks first
const sortTasks = (task1, task2) => task2.taskID - task1.taskID

// selector to get only first 5 latest tasks
const taskSelector = (state) => state.taskReducer.taskList
const topTask = (allTasks) => allTasks.sort(sortTasks).slice(0, 5)
export const topTaskSelector = createSelector(taskSelector, topTask)

// wrapping functions for socket events (connect, disconnect, reconnect)

const connect = () => {
  socket = io(socketServerURL, {
    transports: ['websocket'],
    jsonp: false,
  }).connect()

  return new Promise((resolve) => {
    socket.on('connect', () => {
      resolve(socket)
    })
  })
}

// const disconnect = () => {
//   // socket = io(socketServerURL)
//   return new Promise((resolve) => {
//     socket.on('disconnect', () => {
//       resolve(socket)
//     })
//   })
// }

// const reconnect = () => {
//   // socket = io(socketServerURL)
//   return new Promise((resolve) => {
//     socket.on('reconnect', () => {
//       resolve(socket)
//     })
//   })
// }

// This is how channel is created
// eslint-disable-next-line arrow-parens
const createSocketChannel = (socket) =>
  eventChannel((emit) => {
    const handler = (data) => {
      emit({ data })
    }
    socket.on('newTask', handler)
    return () => {
      socket.off('newTask', handler)
    }
  })

// connection monitoring sagas
// const listenDisconnectSaga = function* () {
//   while (true) {
//     yield call(disconnect)
//     yield put({ type: SERVER_OFF })
//   }
// }

// const listenConnectSaga = function* () {
//   while (true) {
//     yield call(reconnect)
//     yield put({ type: SERVER_ON })
//   }
// }

// Saga to switch on channel.
const listenServerSaga = function* () {
  try {
    yield put({ type: CHANNEL_ON })
    const { timeout, connected: socket } = yield race({
      connected: call(connect),
      timeout: delay(2000),
    })
    if (timeout) {
      console.log('timeout')
      yield put({ type: SERVER_OFF })
    }
    const socketChannel = yield call(createSocketChannel, socket)
    // yield fork(listenDisconnectSaga)
    // yield fork(listenConnectSaga)
    yield put({ type: SERVER_ON })

    while (true) {
      const payload = yield take(socketChannel)
      yield put({ type: ADD_TASK, payload: payload.data })
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    yield put({ type: CHANNEL_OFF })
    if (socket.connected) {
      socket.disconnect()
    }
    console.log('lyc', error)
  } finally {
    if (yield cancelled()) {
      console.log('yield cancelled()')
      if (socket.connected) {
        socket.disconnect()
      }
      yield put({ type: CHANNEL_OFF })
    }
  }
}

function handleInsert(data) {
  socket.emit('insert', data.payload)
}

// saga listens for start and stop actions
export const startStopChannel = function* () {
  while (true) {
    yield take(START_CHANNEL)
    yield takeLatest(INSERT, handleInsert)
    yield race({
      task: call(listenServerSaga),
      cancel: take(STOP_CHANNEL),
    })
  }
}
