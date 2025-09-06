import React from 'react';
import { Label, Select } from 'flowbite-react';
import { Retailer, RETAILER_CONFIGS } from '@root/src/shared/api/retailerApi';

interface RetailerSelectorProps {
  selectedRetailer: Retailer;
  onRetailerChange: (retailer: Retailer) => void;
  availableRetailers?: Retailer[];
}

const RetailerSelector: React.FC<RetailerSelectorProps> = ({
  selectedRetailer,
  onRetailerChange,
  availableRetailers = [Retailer.Amazon, Retailer.HomeDepot],
}) => {
  return (
    <div className="mb-4">
      <div className="mb-2 block">
        <Label htmlFor="retailer-select" value="Select Retailer" />
      </div>
      <Select
        id="retailer-select"
        value={selectedRetailer}
        onChange={e => onRetailerChange(e.target.value as Retailer)}
        required>
        {availableRetailers.map(retailer => (
          <option key={retailer} value={retailer}>
            {RETAILER_CONFIGS[retailer].name}
          </option>
        ))}
      </Select>
    </div>
  );
};

export default RetailerSelector;
