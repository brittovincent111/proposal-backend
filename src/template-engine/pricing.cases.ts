/**
 * Golden pricing cases, shared by both engines.
 *
 * The quotation editor and the server price the same document with two separate
 * implementations. They agree today, and this file is what keeps them agreeing:
 * the SAME cases and the SAME expected totals are asserted in
 * qtn-api/src/template-engine/pricing.parity.spec.ts and
 * qtn-builder/src/lib/pricing/parity.test.ts.
 *
 * The two copies of this file must stay byte-identical. If you change one engine
 * and only one suite fails, that failure is the bug — not the fixture.
 *
 * Amounts are in minor units (paise). Tax ids map to 18%, 5% and exempt.
 */
export const PRICING_CASES = [
  {
    "name": "quantity-rate with 18% tax",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 10,
        "rate": 165000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 1650000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 297000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 1947000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 1650000,
          "tax": 297000
        }
      ]
    }
  },
  {
    "name": "fixed price line",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "FIXED",
        "rate": 2500000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 2500000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 450000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 2950000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 2500000,
          "tax": 450000
        }
      ]
    }
  },
  {
    "name": "quantity rate days",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE_DAYS",
        "quantity": 2,
        "days": 14,
        "rate": 450000,
        "taxRateId": "gst5"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 12600000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 630000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 13230000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 5%",
          "percent": 5,
          "taxable": 12600000,
          "tax": 630000
        }
      ]
    }
  },
  {
    "name": "percentage of running subtotal",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 4,
        "rate": 500000,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "PERCENTAGE",
        "percent": 12.5,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 2250000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 405000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 2655000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 2250000,
          "tax": 405000
        }
      ]
    }
  },
  {
    "name": "formula line over answers",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "FORMULA",
        "formula": "nights * 1200 + 500",
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "scope": {
      "nights": 3
    },
    "expected": {
      "subtotal": 410000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 73800,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 483800,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 410000,
          "tax": 73800
        }
      ]
    }
  },
  {
    "name": "manual amount and area rate",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "MANUAL",
        "manualAmount": 777777,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "AREA_RATE",
        "quantity": 56.5,
        "rate": 165000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 10100277,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 1818050,
      "chargesTotal": 0,
      "roundOffAdjustment": -27,
      "grandTotal": 11918300,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 10100277,
          "tax": 1818050
        }
      ]
    }
  },
  {
    "name": "line discount plus overall percent discount, mixed tax",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 3,
        "rate": 850000,
        "taxRateId": "gst18",
        "discount": {
          "mode": "PERCENT",
          "value": 7.5
        }
      },
      {
        "id": "l2",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 1200000,
        "taxRateId": "gst5"
      },
      {
        "id": "l3",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 2,
        "rate": 300000,
        "taxRateId": "exempt"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 12
    },
    "charges": [
      {
        "id": "c1",
        "label": "Transport",
        "amount": 250000
      }
    ],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 4350000,
      "lineDiscountTotal": 191250,
      "overallDiscountTotal": 499050,
      "discountTotal": 690300,
      "taxTotal": 426426,
      "chargesTotal": 250000,
      "roundOffAdjustment": -26,
      "grandTotal": 4336100,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 2075700,
          "tax": 373626
        },
        {
          "name": "GST 5%",
          "percent": 5,
          "taxable": 1056000,
          "tax": 52800
        }
      ]
    }
  },
  {
    "name": "overall amount discount larger than a single line",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 100000,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 900000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "AMOUNT",
      "value": 5000
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 1000000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 500000,
      "discountTotal": 500000,
      "taxTotal": 90000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 590000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 500000,
          "tax": 90000
        }
      ]
    }
  },
  {
    "name": "discount greater than total is clamped",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 100000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "AMOUNT",
      "value": 99999
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 100000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 100000,
      "discountTotal": 100000,
      "taxTotal": 0,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 0,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 0,
          "tax": 0
        }
      ]
    }
  },
  {
    "name": "hundred percent line discount",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 2,
        "rate": 450000,
        "taxRateId": "gst18",
        "discount": {
          "mode": "PERCENT",
          "value": 100
        }
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 900000,
      "lineDiscountTotal": 900000,
      "overallDiscountTotal": 0,
      "discountTotal": 900000,
      "taxTotal": 0,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 0,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 0,
          "tax": 0
        }
      ]
    }
  },
  {
    "name": "tax inclusive rates",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 3,
        "rate": 118000,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 105000,
        "taxRateId": "gst5"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 5
    },
    "charges": [],
    "taxInclusive": true,
    "roundOff": true,
    "expected": {
      "subtotal": 459000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 22950,
      "discountTotal": 22950,
      "taxTotal": 56050,
      "chargesTotal": 0,
      "roundOffAdjustment": 50,
      "grandTotal": 436100,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 285000,
          "tax": 51300
        },
        {
          "name": "GST 5%",
          "percent": 5,
          "taxable": 95000,
          "tax": 4750
        }
      ]
    }
  },
  {
    "name": "round off disabled keeps the paise",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 7,
        "rate": 33333,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 3.33
    },
    "charges": [
      {
        "id": "c1",
        "label": "Handling",
        "amount": 1111
      }
    ],
    "taxInclusive": false,
    "roundOff": false,
    "expected": {
      "subtotal": 233331,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 7770,
      "discountTotal": 7770,
      "taxTotal": 40601,
      "chargesTotal": 1111,
      "roundOffAdjustment": 0,
      "grandTotal": 267273,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 225561,
          "tax": 40601
        }
      ]
    }
  },
  {
    "name": "optional line excluded from the total",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 500000,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 2,
        "rate": 300000,
        "taxRateId": "gst18",
        "optional": true,
        "selected": false
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 10
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 500000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 50000,
      "discountTotal": 50000,
      "taxTotal": 81000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 531000,
      "optionalTotal": 708000,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 450000,
          "tax": 81000
        }
      ]
    }
  },
  {
    "name": "selected optional line is included",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 1,
        "rate": 500000,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 2,
        "rate": 300000,
        "taxRateId": "gst18",
        "optional": true,
        "selected": true
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 1100000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 198000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 1298000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 1100000,
          "tax": 198000
        }
      ]
    }
  },
  {
    "name": "text lines carry no money",
    "lines": [
      {
        "id": "l1",
        "kind": "HEADING",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 5,
        "rate": 999999
      },
      {
        "id": "l2",
        "kind": "NOTE",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 5,
        "rate": 999999
      },
      {
        "id": "l3",
        "kind": "CUSTOM",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 2,
        "rate": 125000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 250000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 45000,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 295000,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 250000,
          "tax": 45000
        }
      ]
    }
  },
  {
    "name": "negative rate is clamped to zero",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "QUANTITY_RATE",
        "quantity": 2,
        "rate": -50000,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "PERCENT",
      "value": 0
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 0,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 0,
      "discountTotal": 0,
      "taxTotal": 0,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 0,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 0,
          "tax": 0
        }
      ]
    }
  },
  {
    "name": "three-way discount allocation remainder",
    "lines": [
      {
        "id": "l1",
        "pricingMode": "FIXED",
        "rate": 33333,
        "taxRateId": "gst18"
      },
      {
        "id": "l2",
        "pricingMode": "FIXED",
        "rate": 33333,
        "taxRateId": "gst18"
      },
      {
        "id": "l3",
        "pricingMode": "FIXED",
        "rate": 33334,
        "taxRateId": "gst18"
      }
    ],
    "overallDiscount": {
      "mode": "AMOUNT",
      "value": 100
    },
    "charges": [],
    "taxInclusive": false,
    "roundOff": true,
    "expected": {
      "subtotal": 100000,
      "lineDiscountTotal": 0,
      "overallDiscountTotal": 10000,
      "discountTotal": 10000,
      "taxTotal": 16200,
      "chargesTotal": 0,
      "roundOffAdjustment": 0,
      "grandTotal": 106200,
      "optionalTotal": 0,
      "taxSummary": [
        {
          "name": "GST 18%",
          "percent": 18,
          "taxable": 90000,
          "tax": 16200
        }
      ]
    }
  }
] as const;
