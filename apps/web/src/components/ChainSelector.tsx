'use client';

// =============================================================================
// P2P Exchange - Chain Selector Component
// =============================================================================

import { Fragment } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/24/outline';
import { supportedChains } from '@/lib/wagmi';

interface ChainSelectorProps {
  label: string;
  value: number | undefined;
  onChange: (chainId: number) => void;
  disabled?: boolean;
  excludeChain?: number;
}

export function ChainSelector({
  label,
  value,
  onChange,
  disabled = false,
  excludeChain,
}: ChainSelectorProps) {
  const chains = supportedChains.filter((c) => c.id !== excludeChain);
  const selectedChain = chains.find((c) => c.id === value);

  return (
    <div className="space-y-2">
      <label className="label">{label}</label>
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <Listbox.Button className="relative w-full cursor-pointer rounded-lg border border-white/10 bg-surface-light py-3 pl-4 pr-10 text-left text-white transition-colors hover:border-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="block truncate">
              {selectedChain ? selectedChain.name : 'Select chain'}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
              <ChevronUpDownIcon className="h-5 w-5 text-muted" aria-hidden="true" />
            </span>
          </Listbox.Button>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg bg-surface border border-white/10 py-1 shadow-xl focus:outline-none">
              {chains.map((chain) => (
                <Listbox.Option
                  key={chain.id}
                  value={chain.id}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-3 pl-10 pr-4 ${
                      active ? 'bg-white/5 text-white' : 'text-white/80'
                    }`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? 'font-medium' : 'font-normal'
                        }`}
                      >
                        {chain.name}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary">
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}

export default ChainSelector;

