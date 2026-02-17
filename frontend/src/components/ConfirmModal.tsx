import React, { useEffect, useRef, useState } from 'react'

type Props = {
  open: boolean
  title?: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ open, title = 'Confirm', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel }: Props){
  const modalRef = useRef<HTMLDivElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const [closing, setClosing] = useState(false)
  const duration = 220

  useEffect(()=>{
    if(!open) {
      setClosing(false)
      return
    }
    setClosing(false)
    previouslyFocused.current = document.activeElement as HTMLElement | null

    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const el = modalRef.current
    const focusFirst = () => {
      const nodes = el?.querySelectorAll<HTMLElement>(focusableSelector)
      if(nodes && nodes.length) nodes[0].focus()
    }

    const handleKey = (e: KeyboardEvent) => {
      if(!el) return
      if(e.key === 'Escape'){
        e.preventDefault()
        onCancel()
        return
      }
      if(e.key === 'Tab'){
        const nodes = Array.from(el.querySelectorAll<HTMLElement>(focusableSelector))
        if(nodes.length === 0) { e.preventDefault(); return }
        const idx = nodes.indexOf(document.activeElement as HTMLElement)
        if(e.shiftKey){
          if(idx === 0){ nodes[nodes.length-1].focus(); e.preventDefault() }
        } else {
          if(idx === nodes.length-1){ nodes[0].focus(); e.preventDefault() }
        }
      }
    }

    // delay to ensure nodes exist
    const t = setTimeout(focusFirst, 0)
    document.addEventListener('keydown', handleKey)
    return ()=>{
      clearTimeout(t)
      document.removeEventListener('keydown', handleKey)
      // restore focus
      try{ previouslyFocused.current?.focus() }catch{}
    }
  },[open, onCancel])

  // manage enter/exit animation: render while open or closing
  const shouldRender = open || closing
  if(!shouldRender) return null

  function handleCancel(){
    if(closing) return
    setClosing(true)
    setTimeout(()=> onCancel(), duration)
  }

  function handleConfirm(){
    if(closing) return
    setClosing(true)
    setTimeout(()=> onConfirm(), duration)
  }

  return (
    <div className={`modal-overlay ${open && !closing ? 'open' : ''} ${closing ? 'closing' : ''}`} aria-hidden={!open} ref={overlayRef} onMouseDown={(e)=>{ if(e.target === overlayRef.current) handleCancel() }}>
      <div className={`modal ${open && !closing ? 'open' : ''} ${closing ? 'closing' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={modalRef} onMouseDown={(e)=>e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn ghost" onClick={handleCancel}>{cancelLabel}</button>
          <button className="btn primary" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
