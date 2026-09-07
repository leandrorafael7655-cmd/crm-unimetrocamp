"use client"

import { useState } from "react"
import CrmApp from "@/components/crm-app"
import { setStorage } from "@/lib/data/storage-context"
import { makeLocalStorage } from "@/lib/data/local-storage"

/* Modo demonstração: instala o backend de localStorage antes de o CRM montar.
   O inicializador do useState roda durante a renderização deste componente pai,
   portanto executa antes de qualquer efeito dos filhos (onde os dados são lidos). */
export default function CrmDemo() {
  useState(() => {
    setStorage(makeLocalStorage())
    return null
  })
  return <CrmApp modo="demo" />
}
