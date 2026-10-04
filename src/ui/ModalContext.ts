import { createContext, useContext } from 'react'

export const ModalContext = createContext(false)
export const useDentroModalPC = () => useContext(ModalContext)
