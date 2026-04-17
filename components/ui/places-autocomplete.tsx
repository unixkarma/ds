'use client'

import { useRef, useEffect, useState } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'
import { Input } from '@/components/ui/input'

const LIBRARIES: ('places')[] = ['places']

interface PlacesAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder = 'Search address...',
  disabled,
  className,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const [inputValue, setInputValue] = useState(value)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  })

  // Sync external value changes
  useEffect(() => {
    setInputValue(value)
  }, [value])

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      fields: ['formatted_address'],
    })

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      const address = place.formatted_address ?? ''
      setInputValue(address)
      onChange(address)
    })

    autocompleteRef.current = autocomplete
  }, [isLoaded, onChange])

  // If no API key, render a plain input
  if (!apiKey) {
    return (
      <Input
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value)
          onChange(e.target.value)
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    )
  }

  return (
    <Input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value)
        // Don't call onChange here — let autocomplete handle it on selection
        // But also allow manual typing for cases where autocomplete isn't used
      }}
      onBlur={() => {
        // On blur, commit whatever is typed (in case they didn't select from dropdown)
        if (inputValue !== value) {
          onChange(inputValue)
        }
      }}
      placeholder={isLoaded ? placeholder : 'Loading...'}
      disabled={disabled || !isLoaded}
      className={className}
    />
  )
}
