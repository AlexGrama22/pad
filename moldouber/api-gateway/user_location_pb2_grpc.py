# Generated by the gRPC Python protocol compiler plugin. DO NOT EDIT!
"""Client and server classes corresponding to protobuf-defined services."""
import grpc
import warnings

import user_location_pb2 as user__location__pb2

GRPC_GENERATED_VERSION = '1.66.2'
GRPC_VERSION = grpc.__version__
_version_not_supported = False

try:
    from grpc._utilities import first_version_is_lower
    _version_not_supported = first_version_is_lower(GRPC_VERSION, GRPC_GENERATED_VERSION)
except ImportError:
    _version_not_supported = True

if _version_not_supported:
    raise RuntimeError(
        f'The grpc package installed is at version {GRPC_VERSION},'
        + f' but the generated code in user_location_pb2_grpc.py depends on'
        + f' grpcio>={GRPC_GENERATED_VERSION}.'
        + f' Please upgrade your grpc module to grpcio>={GRPC_GENERATED_VERSION}'
        + f' or downgrade your generated code using grpcio-tools<={GRPC_VERSION}.'
    )


class UserLocationServiceStub(object):
    """Missing associated documentation comment in .proto file."""

    def __init__(self, channel):
        """Constructor.

        Args:
            channel: A grpc.Channel.
        """
        self.MakeOrder = channel.unary_unary(
                '/userLocation.UserLocationService/MakeOrder',
                request_serializer=user__location__pb2.OrderRequest.SerializeToString,
                response_deserializer=user__location__pb2.OrderResponse.FromString,
                _registered_method=True)
        self.AcceptOrder = channel.unary_unary(
                '/userLocation.UserLocationService/AcceptOrder',
                request_serializer=user__location__pb2.AcceptOrderRequest.SerializeToString,
                response_deserializer=user__location__pb2.AcceptOrderResponse.FromString,
                _registered_method=True)
        self.FinishOrder = channel.unary_unary(
                '/userLocation.UserLocationService/FinishOrder',
                request_serializer=user__location__pb2.FinishOrderRequest.SerializeToString,
                response_deserializer=user__location__pb2.FinishOrderResponse.FromString,
                _registered_method=True)
        self.PaymentCheck = channel.unary_unary(
                '/userLocation.UserLocationService/PaymentCheck',
                request_serializer=user__location__pb2.PaymentCheckRequest.SerializeToString,
                response_deserializer=user__location__pb2.PaymentCheckResponse.FromString,
                _registered_method=True)


class UserLocationServiceServicer(object):
    """Missing associated documentation comment in .proto file."""

    def MakeOrder(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('Method not implemented!')
        raise NotImplementedError('Method not implemented!')

    def AcceptOrder(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('Method not implemented!')
        raise NotImplementedError('Method not implemented!')

    def FinishOrder(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('Method not implemented!')
        raise NotImplementedError('Method not implemented!')

    def PaymentCheck(self, request, context):
        """Missing associated documentation comment in .proto file."""
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('Method not implemented!')
        raise NotImplementedError('Method not implemented!')


def add_UserLocationServiceServicer_to_server(servicer, server):
    rpc_method_handlers = {
            'MakeOrder': grpc.unary_unary_rpc_method_handler(
                    servicer.MakeOrder,
                    request_deserializer=user__location__pb2.OrderRequest.FromString,
                    response_serializer=user__location__pb2.OrderResponse.SerializeToString,
            ),
            'AcceptOrder': grpc.unary_unary_rpc_method_handler(
                    servicer.AcceptOrder,
                    request_deserializer=user__location__pb2.AcceptOrderRequest.FromString,
                    response_serializer=user__location__pb2.AcceptOrderResponse.SerializeToString,
            ),
            'FinishOrder': grpc.unary_unary_rpc_method_handler(
                    servicer.FinishOrder,
                    request_deserializer=user__location__pb2.FinishOrderRequest.FromString,
                    response_serializer=user__location__pb2.FinishOrderResponse.SerializeToString,
            ),
            'PaymentCheck': grpc.unary_unary_rpc_method_handler(
                    servicer.PaymentCheck,
                    request_deserializer=user__location__pb2.PaymentCheckRequest.FromString,
                    response_serializer=user__location__pb2.PaymentCheckResponse.SerializeToString,
            ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
            'userLocation.UserLocationService', rpc_method_handlers)
    server.add_generic_rpc_handlers((generic_handler,))
    server.add_registered_method_handlers('userLocation.UserLocationService', rpc_method_handlers)


 # This class is part of an EXPERIMENTAL API.
class UserLocationService(object):
    """Missing associated documentation comment in .proto file."""

    @staticmethod
    def MakeOrder(request,
            target,
            options=(),
            channel_credentials=None,
            call_credentials=None,
            insecure=False,
            compression=None,
            wait_for_ready=None,
            timeout=None,
            metadata=None):
        return grpc.experimental.unary_unary(
            request,
            target,
            '/userLocation.UserLocationService/MakeOrder',
            user__location__pb2.OrderRequest.SerializeToString,
            user__location__pb2.OrderResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
            _registered_method=True)

    @staticmethod
    def AcceptOrder(request,
            target,
            options=(),
            channel_credentials=None,
            call_credentials=None,
            insecure=False,
            compression=None,
            wait_for_ready=None,
            timeout=None,
            metadata=None):
        return grpc.experimental.unary_unary(
            request,
            target,
            '/userLocation.UserLocationService/AcceptOrder',
            user__location__pb2.AcceptOrderRequest.SerializeToString,
            user__location__pb2.AcceptOrderResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
            _registered_method=True)

    @staticmethod
    def FinishOrder(request,
            target,
            options=(),
            channel_credentials=None,
            call_credentials=None,
            insecure=False,
            compression=None,
            wait_for_ready=None,
            timeout=None,
            metadata=None):
        return grpc.experimental.unary_unary(
            request,
            target,
            '/userLocation.UserLocationService/FinishOrder',
            user__location__pb2.FinishOrderRequest.SerializeToString,
            user__location__pb2.FinishOrderResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
            _registered_method=True)

    @staticmethod
    def PaymentCheck(request,
            target,
            options=(),
            channel_credentials=None,
            call_credentials=None,
            insecure=False,
            compression=None,
            wait_for_ready=None,
            timeout=None,
            metadata=None):
        return grpc.experimental.unary_unary(
            request,
            target,
            '/userLocation.UserLocationService/PaymentCheck',
            user__location__pb2.PaymentCheckRequest.SerializeToString,
            user__location__pb2.PaymentCheckResponse.FromString,
            options,
            channel_credentials,
            insecure,
            call_credentials,
            compression,
            wait_for_ready,
            timeout,
            metadata,
            _registered_method=True)
